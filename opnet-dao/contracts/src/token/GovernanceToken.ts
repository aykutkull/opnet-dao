import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address,
    Blockchain,
    BytesWriter,
    Calldata,
    OP20,
    OP20InitParameters,
    Revert,
} from '@btc-vision/btc-runtime/runtime';

// @method, @returns, @emit, @final, ABIDataTypes are transform-injected globals — no import needed.

/**
 * GovernanceToken — OP20 governance token for OPNet DAO.
 *
 * - Standard OP20 interface (transfer, approve, transferFrom, balanceOf, allowance)
 * - Mint restricted to deployer
 * - 18 decimals, 100 million max supply
 * - Symbol: GOV
 */
@final
export class GovernanceToken extends OP20 {
    public constructor() {
        super();
    }

    public override onDeployment(_calldata: Calldata): void {
        // 100 million tokens × 10^18
        const maxSupply: u256 = u256.fromString('100000000000000000000000000');
        this.instantiate(new OP20InitParameters(maxSupply, 18, 'OPNet DAO Governance', 'GOV'));
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    /**
     * Mint governance tokens — deployer only.
     *
     * @param calldata { to: address, amount: uint256 }
     * @returns { success: bool }
     */
    @method({ name: 'to', type: ABIDataTypes.ADDRESS }, { name: 'amount', type: ABIDataTypes.UINT256 })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    @emit('Minted')
    public mint(calldata: Calldata): BytesWriter {
        this.onlyDeployer(Blockchain.tx.sender);

        const to: Address = calldata.readAddress();
        const amount: u256 = calldata.readU256();

        if (amount == u256.Zero) {
            throw new Revert('GovernanceToken: zero amount');
        }

        this._mint(to, amount);

        const response = new BytesWriter(1);
        response.writeBoolean(true);
        return response;
    }

    // ─── Overrides ────────────────────────────────────────────────────────────

    public override callMethod(calldata: Calldata): BytesWriter {
        const selector: u32 = calldata.readSelector();
        switch (selector) {
            case this.mintSelector:
                return this.mint(calldata);
            default:
                return super.callMethod(calldata);
        }
    }

    // ─── Private ──────────────────────────────────────────────────────────────

    private readonly mintSelector: u32 = encodeSelector('mint(address,uint256)');
}
