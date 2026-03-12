import { useCallback, useState } from 'react';
import { getContract } from 'opnet';
import { useOpNet } from './useOpNet';
import { getAddresses } from '../config/contracts';

// ─── ABI ──────────────────────────────────────────────────────────────────────

const GOVERNOR_ABI = [
    {
        name: 'propose',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [{ name: 'description', type: 'string' }],
        outputs: [{ name: 'proposalId', type: 'uint32' }],
    },
    {
        name: 'castVote',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'proposalId', type: 'uint32' },
            { name: 'support', type: 'uint8' },
        ],
        outputs: [{ name: 'success', type: 'bool' }],
    },
    {
        name: 'execute',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [{ name: 'proposalId', type: 'uint32' }],
        outputs: [{ name: 'success', type: 'bool' }],
    },
    {
        name: 'cancel',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [{ name: 'proposalId', type: 'uint32' }],
        outputs: [{ name: 'success', type: 'bool' }],
    },
    {
        name: 'getProposal',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'proposalId', type: 'uint32' }],
        outputs: [
            { name: 'proposer', type: 'address' },
            { name: 'forVotes', type: 'uint256' },
            { name: 'againstVotes', type: 'uint256' },
            { name: 'abstainVotes', type: 'uint256' },
            { name: 'startBlock', type: 'uint256' },
            { name: 'endBlock', type: 'uint256' },
            { name: 'executed', type: 'bool' },
            { name: 'canceled', type: 'bool' },
            { name: 'state', type: 'uint8' },
            { name: 'description', type: 'string' },
        ],
    },
    {
        name: 'proposalState',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'proposalId', type: 'uint32' }],
        outputs: [{ name: 'state', type: 'uint8' }],
    },
    {
        name: 'proposalCount',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: 'count', type: 'uint256' }],
    },
    {
        name: 'quorum',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: 'quorumBps', type: 'uint256' }],
    },
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Proposal {
    readonly id: number;
    readonly proposer: string;
    readonly description: string;
    readonly forVotes: bigint;
    readonly againstVotes: bigint;
    readonly abstainVotes: bigint;
    readonly startBlock: bigint;
    readonly endBlock: bigint;
    readonly executed: boolean;
    readonly canceled: boolean;
    readonly state: number;
}

export const STATE_LABELS: Record<number, string> = {
    0: 'Pending',
    1: 'Active',
    2: 'Canceled',
    3: 'Defeated',
    4: 'Succeeded',
    5: 'Executed',
};

interface UseDAOReturn {
    readonly proposals: Proposal[];
    readonly isLoading: boolean;
    readonly error: string | null;
    readonly loadProposals: () => Promise<void>;
    readonly createProposal: (description: string) => Promise<string | null>;
    readonly vote: (proposalId: number, support: 0 | 1 | 2) => Promise<string | null>;
    readonly executeProposal: (proposalId: number) => Promise<string | null>;
    readonly cancelProposal: (proposalId: number) => Promise<string | null>;
    readonly isSubmitting: boolean;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDAO(): UseDAOReturn {
    const { provider, network, walletAddress } = useOpNet();
    const [proposals, setProposals] = useState<Proposal[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const getGovernor = useCallback(() => {
        if (!provider || !walletAddress) return null;
        try {
            const { governor } = getAddresses(network);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return getContract<any>(governor, GOVERNOR_ABI, provider, network, walletAddress);
        } catch {
            return null;
        }
    }, [provider, network, walletAddress]);

    const loadProposals = useCallback(async () => {
        const gov = getGovernor();
        if (!gov) return;

        setIsLoading(true);
        setError(null);
        try {
            const countResult = await gov.proposalCount();
            if (countResult.revert) throw new Error(countResult.revert as string);

            const count = Number(countResult.properties.count as bigint);
            const loaded: Proposal[] = [];

            for (let i = 0; i < count; i++) {
                const result = await gov.getProposal(i);
                if (result.revert) continue;
                const p = result.properties;
                loaded.push({
                    id: i,
                    proposer: String(p.proposer),
                    description: String(p.description),
                    forVotes: p.forVotes as bigint,
                    againstVotes: p.againstVotes as bigint,
                    abstainVotes: p.abstainVotes as bigint,
                    startBlock: p.startBlock as bigint,
                    endBlock: p.endBlock as bigint,
                    executed: Boolean(p.executed),
                    canceled: Boolean(p.canceled),
                    state: Number(p.state),
                });
            }
            setProposals(loaded.reverse()); // newest first
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsLoading(false);
        }
    }, [getGovernor]);

    const createProposal = useCallback(async (description: string): Promise<string | null> => {
        const gov = getGovernor();
        if (!gov || !walletAddress) {
            setError('Wallet not connected');
            return null;
        }

        setIsSubmitting(true);
        setError(null);
        try {
            const sim = await gov.propose(description);
            if (sim.revert) throw new Error(sim.revert as string);

            const receipt = await sim.sendTransaction({
                signer: null,
                mldsaSigner: null,
                refundTo: walletAddress,
                maximumAllowedSatToSpend: 500_000n,
                feeRate: 10,
                network,
            });
            return receipt.transactionId ?? null;
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            return null;
        } finally {
            setIsSubmitting(false);
        }
    }, [getGovernor, walletAddress, network]);

    const vote = useCallback(async (proposalId: number, support: 0 | 1 | 2): Promise<string | null> => {
        const gov = getGovernor();
        if (!gov || !walletAddress) {
            setError('Wallet not connected');
            return null;
        }

        setIsSubmitting(true);
        setError(null);
        try {
            const sim = await gov.castVote(proposalId, support);
            if (sim.revert) throw new Error(sim.revert as string);

            const receipt = await sim.sendTransaction({
                signer: null,
                mldsaSigner: null,
                refundTo: walletAddress,
                maximumAllowedSatToSpend: 500_000n,
                feeRate: 10,
                network,
            });
            return receipt.transactionId ?? null;
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            return null;
        } finally {
            setIsSubmitting(false);
        }
    }, [getGovernor, walletAddress, network]);

    const executeProposal = useCallback(async (proposalId: number): Promise<string | null> => {
        const gov = getGovernor();
        if (!gov || !walletAddress) {
            setError('Wallet not connected');
            return null;
        }

        setIsSubmitting(true);
        setError(null);
        try {
            const sim = await gov.execute(proposalId);
            if (sim.revert) throw new Error(sim.revert as string);

            const receipt = await sim.sendTransaction({
                signer: null,
                mldsaSigner: null,
                refundTo: walletAddress,
                maximumAllowedSatToSpend: 500_000n,
                feeRate: 10,
                network,
            });
            return receipt.transactionId ?? null;
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            return null;
        } finally {
            setIsSubmitting(false);
        }
    }, [getGovernor, walletAddress, network]);

    const cancelProposal = useCallback(async (proposalId: number): Promise<string | null> => {
        const gov = getGovernor();
        if (!gov || !walletAddress) {
            setError('Wallet not connected');
            return null;
        }

        setIsSubmitting(true);
        setError(null);
        try {
            const sim = await gov.cancel(proposalId);
            if (sim.revert) throw new Error(sim.revert as string);

            const receipt = await sim.sendTransaction({
                signer: null,
                mldsaSigner: null,
                refundTo: walletAddress,
                maximumAllowedSatToSpend: 500_000n,
                feeRate: 10,
                network,
            });
            return receipt.transactionId ?? null;
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            return null;
        } finally {
            setIsSubmitting(false);
        }
    }, [getGovernor, walletAddress, network]);

    return {
        proposals,
        isLoading,
        error,
        loadProposals,
        createProposal,
        vote,
        executeProposal,
        cancelProposal,
        isSubmitting,
    };
}
