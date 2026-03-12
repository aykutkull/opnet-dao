import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address,
    Blockchain,
    BytesWriter,
    Calldata,
    OP_NET,
    Revert,
    SafeMath,
    StoredString,
    StoredU256,
} from '@btc-vision/btc-runtime/runtime';

// @method, @returns, @emit, @final, ABIDataTypes are transform-injected globals — no import needed.

// ─── Proposal States ──────────────────────────────────────────────────────────

// 0 = Pending  (not yet started)
// 1 = Active   (voting open)
// 2 = Canceled
// 3 = Defeated (quorum not met or against >= for)
// 4 = Succeeded (passed, not yet executed)
// 5 = Executed

// ─── Vote Support Values ──────────────────────────────────────────────────────
// 0 = Against
// 1 = For
// 2 = Abstain

// ─── Storage Layout ───────────────────────────────────────────────────────────
// Static slots (allocated via Blockchain.nextPointer):
//   0 → proposalCount
//   1 → govTokenAddress (string)
//   2 → votingPeriod (u256, treated as u64 block count)
//   3 → quorumBps (u256, basis points of circulating supply, e.g. 400 = 4%)
//
// Per proposal (base = PROPOSALS_BASE = 10, 10 slots each, max 200 proposals):
//   base + id*10 + 0 → proposer (StoredString)
//   base + id*10 + 1 → forVotes (StoredU256)
//   base + id*10 + 2 → againstVotes (StoredU256)
//   base + id*10 + 3 → abstainVotes (StoredU256)
//   base + id*10 + 4 → startBlock (StoredU256)
//   base + id*10 + 5 → endBlock (StoredU256)
//   base + id*10 + 6 → executed flag (StoredU256, 0 or 1)
//   base + id*10 + 7 → canceled flag (StoredU256, 0 or 1)
//   base + id*10 + 8 → description (StoredString)
//   base + id*10 + 9 → reserved
//
// Per vote (base = VOTES_BASE = 2100, fingerprint range 0..62000):
//   VOTES_BASE + fingerprint → vote state StoredU256 (0=not voted, 1=for, 2=against, 3=abstain)
//   fingerprint = (proposalId * 997 + addressHash) % 62000
//   addressHash = low 16 bits of XOR of address bytes

const PROPOSALS_BASE: u32 = 10;
const VOTES_BASE: u32 = 2100;
const MAX_PROPOSALS: u32 = 200;
const FIELDS_PER_PROPOSAL: u32 = 10;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addressHash16(addr: Address): u32 {
    const s: string = addr.toString();
    let h: u32 = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h ^ (s.charCodeAt(i) as u32)) * 16777619;
    }
    return h & 0xFFFF;
}

function voteFingerprint(proposalId: u32, voter: Address): u32 {
    return ((proposalId * 997) + addressHash16(voter)) % 62000;
}

function proposalPtr(proposalId: u32, field: u32): u16 {
    return (PROPOSALS_BASE + proposalId * FIELDS_PER_PROPOSAL + field) as u16;
}

function votePtr(proposalId: u32, voter: Address): u16 {
    return (VOTES_BASE + voteFingerprint(proposalId, voter)) as u16;
}

// ─── Contract ─────────────────────────────────────────────────────────────────

/**
 * DAOGovernor — on-chain governance for OPNet DAO.
 *
 * Members holding GOV tokens can:
 *   1. propose()    — create a new governance proposal
 *   2. castVote()   — vote For / Against / Abstain
 *   3. execute()    — execute a succeeded proposal (after voting ends)
 *   4. cancel()     — proposer can cancel their own proposal
 *
 * View methods:
 *   getProposal()     — full proposal data
 *   proposalState()   — current lifecycle state
 *   proposalCount()   — total proposals created
 *   quorum()          — minimum votes required (returns raw token amount)
 */
@final
export class DAOGovernor extends OP_NET {
    // ── Static storage pointers ────────────────────────────────────────────────

    private readonly proposalCountPtr: u16 = Blockchain.nextPointer;
    private readonly govTokenPtr: u16 = Blockchain.nextPointer;
    private readonly votingPeriodPtr: u16 = Blockchain.nextPointer;
    private readonly quorumBpsPtr: u16 = Blockchain.nextPointer;

    // ── Selectors ─────────────────────────────────────────────────────────────

    private readonly proposeSelector: u32 = encodeSelector('propose(string)');
    private readonly castVoteSelector: u32 = encodeSelector('castVote(uint32,uint8)');
    private readonly executeSelector: u32 = encodeSelector('execute(uint32)');
    private readonly cancelSelector: u32 = encodeSelector('cancel(uint32)');
    private readonly getProposalSelector: u32 = encodeSelector('getProposal(uint32)');
    private readonly proposalStateSelector: u32 = encodeSelector('proposalState(uint32)');
    private readonly proposalCountSelector: u32 = encodeSelector('proposalCount()');
    private readonly quorumSelector: u32 = encodeSelector('quorum()');

    public constructor() {
        super();
    }

    // ─── Deployment ───────────────────────────────────────────────────────────

    /**
     * Deploy the DAO governor.
     * Calldata: govToken (address), votingPeriod (uint256 blocks), quorumBps (uint256)
     */
    public override onDeployment(calldata: Calldata): void {
        const govToken: Address = calldata.readAddress();
        const votingPeriod: u256 = calldata.readU256();
        const quorumBps: u256 = calldata.readU256();

        new StoredString(this.govTokenPtr, '').set(govToken.toString());
        new StoredU256(this.votingPeriodPtr, u256.Zero).set(votingPeriod);
        new StoredU256(this.quorumBpsPtr, u256.Zero).set(quorumBps);
        new StoredU256(this.proposalCountPtr, u256.Zero).set(u256.Zero);
    }

    // ─── propose ──────────────────────────────────────────────────────────────

    /**
     * Create a new governance proposal.
     *
     * @param calldata { description: string }
     * @returns { proposalId: uint32 }
     */
    @method({ name: 'description', type: ABIDataTypes.STRING })
    @returns({ name: 'proposalId', type: ABIDataTypes.UINT32 })
    @emit('ProposalCreated')
    public propose(calldata: Calldata): BytesWriter {
        const description: string = calldata.readStringWithLength();
        if (description.length === 0) {
            throw new Revert('DAOGovernor: empty description');
        }
        if (description.length > 500) {
            throw new Revert('DAOGovernor: description too long');
        }

        const countStorage = new StoredU256(this.proposalCountPtr, u256.Zero);
        const count: u256 = countStorage.get();
        const countU32: u32 = count.lo1 as u32;

        if (countU32 >= MAX_PROPOSALS) {
            throw new Revert('DAOGovernor: max proposals reached');
        }

        const proposalId: u32 = countU32;
        const proposer: Address = Blockchain.tx.sender;
        const votingPeriod: u256 = new StoredU256(this.votingPeriodPtr, u256.Zero).get();
        const startBlock: u256 = u256.fromU64(Blockchain.block.number);
        const endBlock: u256 = SafeMath.add(startBlock, votingPeriod);

        // Store proposal data
        new StoredString(proposalPtr(proposalId, 0), '').set(proposer.toString());
        new StoredU256(proposalPtr(proposalId, 1), u256.Zero).set(u256.Zero); // forVotes
        new StoredU256(proposalPtr(proposalId, 2), u256.Zero).set(u256.Zero); // againstVotes
        new StoredU256(proposalPtr(proposalId, 3), u256.Zero).set(u256.Zero); // abstainVotes
        new StoredU256(proposalPtr(proposalId, 4), u256.Zero).set(startBlock);
        new StoredU256(proposalPtr(proposalId, 5), u256.Zero).set(endBlock);
        new StoredU256(proposalPtr(proposalId, 6), u256.Zero).set(u256.Zero); // executed=false
        new StoredU256(proposalPtr(proposalId, 7), u256.Zero).set(u256.Zero); // canceled=false
        new StoredString(proposalPtr(proposalId, 8), '').set(description);

        // Increment proposal count
        countStorage.set(SafeMath.add(count, u256.One));

        const response = new BytesWriter(4);
        response.writeU32(proposalId);
        return response;
    }

    // ─── castVote ─────────────────────────────────────────────────────────────

    /**
     * Vote on a proposal.
     *
     * @param calldata { proposalId: uint32, support: uint8 }  (support: 0=against, 1=for, 2=abstain)
     * @returns { success: bool }
     */
    @method(
        { name: 'proposalId', type: ABIDataTypes.UINT32 },
        { name: 'support', type: ABIDataTypes.UINT8 },
    )
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    @emit('VoteCast')
    public castVote(calldata: Calldata): BytesWriter {
        const proposalId: u32 = calldata.readU32();
        const support: u8 = calldata.readU8();

        this._assertProposalExists(proposalId);
        this._assertState(proposalId, 1); // Must be Active

        if (support > 2) {
            throw new Revert('DAOGovernor: invalid support value');
        }

        const voter: Address = Blockchain.tx.sender;
        const votePtrVal = votePtr(proposalId, voter);
        const voteStorage = new StoredU256(votePtrVal, u256.Zero);

        if (voteStorage.get() != u256.Zero) {
            throw new Revert('DAOGovernor: already voted');
        }

        // Record vote (1=for, 2=against, 3=abstain to distinguish from 0=not voted)
        voteStorage.set(u256.fromU32((support as u32) + 1));

        // Add 1 vote weight (simplified: 1 vote per address, not token-weighted for now)
        const weight: u256 = u256.One;

        if (support === 1) {
            const slot = new StoredU256(proposalPtr(proposalId, 1), u256.Zero);
            slot.set(SafeMath.add(slot.get(), weight));
        } else if (support === 0) {
            const slot = new StoredU256(proposalPtr(proposalId, 2), u256.Zero);
            slot.set(SafeMath.add(slot.get(), weight));
        } else {
            const slot = new StoredU256(proposalPtr(proposalId, 3), u256.Zero);
            slot.set(SafeMath.add(slot.get(), weight));
        }

        const response = new BytesWriter(1);
        response.writeBoolean(true);
        return response;
    }

    // ─── execute ──────────────────────────────────────────────────────────────

    /**
     * Execute a succeeded proposal.
     *
     * @param calldata { proposalId: uint32 }
     * @returns { success: bool }
     */
    @method({ name: 'proposalId', type: ABIDataTypes.UINT32 })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    @emit('ProposalExecuted')
    public execute(calldata: Calldata): BytesWriter {
        const proposalId: u32 = calldata.readU32();

        this._assertProposalExists(proposalId);
        this._assertState(proposalId, 4); // Must be Succeeded

        // Mark as executed
        new StoredU256(proposalPtr(proposalId, 6), u256.Zero).set(u256.One);

        const response = new BytesWriter(1);
        response.writeBoolean(true);
        return response;
    }

    // ─── cancel ───────────────────────────────────────────────────────────────

    /**
     * Cancel a proposal — only the original proposer can cancel.
     *
     * @param calldata { proposalId: uint32 }
     * @returns { success: bool }
     */
    @method({ name: 'proposalId', type: ABIDataTypes.UINT32 })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    @emit('ProposalCanceled')
    public cancel(calldata: Calldata): BytesWriter {
        const proposalId: u32 = calldata.readU32();

        this._assertProposalExists(proposalId);

        const state = this._getState(proposalId);
        if (state === 2 || state === 5) {
            throw new Revert('DAOGovernor: cannot cancel in this state');
        }

        const proposer: string = new StoredString(proposalPtr(proposalId, 0), '').get();
        if (Blockchain.tx.sender.toString() !== proposer) {
            throw new Revert('DAOGovernor: not proposer');
        }

        new StoredU256(proposalPtr(proposalId, 7), u256.Zero).set(u256.One);

        const response = new BytesWriter(1);
        response.writeBoolean(true);
        return response;
    }

    // ─── getProposal ──────────────────────────────────────────────────────────

    /**
     * Read all data for a proposal.
     *
     * @param calldata { proposalId: uint32 }
     * @returns {
     *   proposer: address,
     *   forVotes: uint256,
     *   againstVotes: uint256,
     *   abstainVotes: uint256,
     *   startBlock: uint256,
     *   endBlock: uint256,
     *   executed: bool,
     *   canceled: bool,
     *   state: uint8,
     *   description: string
     * }
     */
    @method({ name: 'proposalId', type: ABIDataTypes.UINT32 })
    @returns(
        { name: 'proposer', type: ABIDataTypes.ADDRESS },
        { name: 'forVotes', type: ABIDataTypes.UINT256 },
        { name: 'againstVotes', type: ABIDataTypes.UINT256 },
        { name: 'abstainVotes', type: ABIDataTypes.UINT256 },
        { name: 'startBlock', type: ABIDataTypes.UINT256 },
        { name: 'endBlock', type: ABIDataTypes.UINT256 },
        { name: 'executed', type: ABIDataTypes.BOOL },
        { name: 'canceled', type: ABIDataTypes.BOOL },
        { name: 'state', type: ABIDataTypes.UINT8 },
        { name: 'description', type: ABIDataTypes.STRING },
    )
    public getProposal(calldata: Calldata): BytesWriter {
        const proposalId: u32 = calldata.readU32();
        this._assertProposalExists(proposalId);

        const proposerStr: string = new StoredString(proposalPtr(proposalId, 0), '').get();
        const forVotes: u256 = new StoredU256(proposalPtr(proposalId, 1), u256.Zero).get();
        const againstVotes: u256 = new StoredU256(proposalPtr(proposalId, 2), u256.Zero).get();
        const abstainVotes: u256 = new StoredU256(proposalPtr(proposalId, 3), u256.Zero).get();
        const startBlock: u256 = new StoredU256(proposalPtr(proposalId, 4), u256.Zero).get();
        const endBlock: u256 = new StoredU256(proposalPtr(proposalId, 5), u256.Zero).get();
        const executed: bool = new StoredU256(proposalPtr(proposalId, 6), u256.Zero).get() != u256.Zero;
        const canceled: bool = new StoredU256(proposalPtr(proposalId, 7), u256.Zero).get() != u256.Zero;
        const description: string = new StoredString(proposalPtr(proposalId, 8), '').get();
        const state: u8 = this._getState(proposalId) as u8;

        // Estimate response size
        const writer = new BytesWriter(33 + 32 + 32 + 32 + 32 + 32 + 1 + 1 + 1 + description.length * 2 + 4);
        writer.writeAddress(Address.fromString(proposerStr));
        writer.writeU256(forVotes);
        writer.writeU256(againstVotes);
        writer.writeU256(abstainVotes);
        writer.writeU256(startBlock);
        writer.writeU256(endBlock);
        writer.writeBoolean(executed);
        writer.writeBoolean(canceled);
        writer.writeU8(state);
        writer.writeStringWithLength(description);
        return writer;
    }

    // ─── proposalState ────────────────────────────────────────────────────────

    /**
     * Get the current state of a proposal.
     *
     * @param calldata { proposalId: uint32 }
     * @returns { state: uint8 }
     */
    @method({ name: 'proposalId', type: ABIDataTypes.UINT32 })
    @returns({ name: 'state', type: ABIDataTypes.UINT8 })
    public proposalState(calldata: Calldata): BytesWriter {
        const proposalId: u32 = calldata.readU32();
        this._assertProposalExists(proposalId);

        const response = new BytesWriter(1);
        response.writeU8(this._getState(proposalId) as u8);
        return response;
    }

    // ─── proposalCount ────────────────────────────────────────────────────────

    /**
     * Get total number of proposals created.
     *
     * @returns { count: uint256 }
     */
    @method()
    @returns({ name: 'count', type: ABIDataTypes.UINT256 })
    public proposalCount(_calldata: Calldata): BytesWriter {
        const response = new BytesWriter(32);
        response.writeU256(new StoredU256(this.proposalCountPtr, u256.Zero).get());
        return response;
    }

    // ─── quorum ───────────────────────────────────────────────────────────────

    /**
     * Get the quorum basis points (% of total supply required).
     *
     * @returns { quorumBps: uint256 }
     */
    @method()
    @returns({ name: 'quorumBps', type: ABIDataTypes.UINT256 })
    public quorum(_calldata: Calldata): BytesWriter {
        const response = new BytesWriter(32);
        response.writeU256(new StoredU256(this.quorumBpsPtr, u256.Zero).get());
        return response;
    }

    // ─── callMethod ───────────────────────────────────────────────────────────

    public override callMethod(calldata: Calldata): BytesWriter {
        const selector: u32 = calldata.readSelector();
        switch (selector) {
            case this.proposeSelector:
                return this.propose(calldata);
            case this.castVoteSelector:
                return this.castVote(calldata);
            case this.executeSelector:
                return this.execute(calldata);
            case this.cancelSelector:
                return this.cancel(calldata);
            case this.getProposalSelector:
                return this.getProposal(calldata);
            case this.proposalStateSelector:
                return this.proposalState(calldata);
            case this.proposalCountSelector:
                return this.proposalCount(calldata);
            case this.quorumSelector:
                return this.quorum(calldata);
            default:
                return super.callMethod(calldata);
        }
    }

    // ─── Private helpers ──────────────────────────────────────────────────────

    private _assertProposalExists(proposalId: u32): void {
        const count: u256 = new StoredU256(this.proposalCountPtr, u256.Zero).get();
        if ((proposalId as u64) >= count.lo1) {
            throw new Revert('DAOGovernor: proposal does not exist');
        }
    }

    private _assertState(proposalId: u32, expectedState: u8): void {
        const actual: u8 = this._getState(proposalId) as u8;
        if (actual !== expectedState) {
            throw new Revert('DAOGovernor: invalid proposal state');
        }
    }

    /**
     * Compute proposal lifecycle state:
     *   0 = Pending   (block < startBlock)
     *   1 = Active    (startBlock <= block <= endBlock)
     *   2 = Canceled
     *   3 = Defeated  (voting ended, quorum not met or against >= for)
     *   4 = Succeeded (voting ended, for > against, quorum TBD)
     *   5 = Executed
     */
    private _getState(proposalId: u32): u8 {
        const canceled: bool = new StoredU256(proposalPtr(proposalId, 7), u256.Zero).get() != u256.Zero;
        if (canceled) return 2;

        const executed: bool = new StoredU256(proposalPtr(proposalId, 6), u256.Zero).get() != u256.Zero;
        if (executed) return 5;

        const currentBlock: u256 = u256.fromU64(Blockchain.block.number);
        const startBlock: u256 = new StoredU256(proposalPtr(proposalId, 4), u256.Zero).get();
        const endBlock: u256 = new StoredU256(proposalPtr(proposalId, 5), u256.Zero).get();

        if (u256.lt(currentBlock, startBlock)) return 0; // Pending
        if (u256.le(currentBlock, endBlock)) return 1;   // Active

        // Voting ended — check result
        const forVotes: u256 = new StoredU256(proposalPtr(proposalId, 1), u256.Zero).get();
        const againstVotes: u256 = new StoredU256(proposalPtr(proposalId, 2), u256.Zero).get();

        if (u256.gt(forVotes, againstVotes)) return 4; // Succeeded
        return 3;                                       // Defeated
    }
}
