import { useState } from 'react';
import { type Proposal, STATE_LABELS, useDAO } from '../hooks/useDAO';
import { useOpNet } from '../hooks/useOpNet';

interface Props {
    readonly proposal: Proposal;
    readonly onRefresh: () => void;
}

const STATE_CLASS: Record<number, string> = {
    0: 'badge-pending',
    1: 'badge-active',
    2: 'badge-canceled',
    3: 'badge-defeated',
    4: 'badge-succeeded',
    5: 'badge-executed',
};

function formatAddr(addr: string): string {
    if (addr.length <= 12) return addr;
    return `${addr.slice(0, 6)}…${addr.slice(-6)}`;
}

function totalVotes(p: Proposal): bigint {
    return p.forVotes + p.againstVotes + p.abstainVotes;
}

function pct(votes: bigint, total: bigint): number {
    if (total === 0n) return 0;
    return Number((votes * 1000n) / total) / 10;
}

export function ProposalCard({ proposal: p, onRefresh }: Props): JSX.Element {
    const { walletAddress } = useOpNet();
    const { vote, executeProposal, cancelProposal, isSubmitting, error } = useDAO();
    const [txHash, setTxHash] = useState<string | null>(null);
    const [localError, setLocalError] = useState<string | null>(null);

    const total = totalVotes(p);
    const isActive = p.state === 1;
    const isSucceeded = p.state === 4;
    const isProposer = walletAddress != null &&
        p.proposer.toLowerCase() === walletAddress.toLowerCase();

    async function handleVote(support: 0 | 1 | 2): Promise<void> {
        setLocalError(null);
        const tx = await vote(p.id, support);
        if (tx) { setTxHash(tx); onRefresh(); }
        else setLocalError(error);
    }

    async function handleExecute(): Promise<void> {
        setLocalError(null);
        const tx = await executeProposal(p.id);
        if (tx) { setTxHash(tx); onRefresh(); }
        else setLocalError(error);
    }

    async function handleCancel(): Promise<void> {
        setLocalError(null);
        const tx = await cancelProposal(p.id);
        if (tx) { setTxHash(tx); onRefresh(); }
        else setLocalError(error);
    }

    return (
        <div className="proposal-card">
            <div className="proposal-header">
                <div className="proposal-meta">
                    <span className="proposal-id">#{p.id}</span>
                    <span className={`badge ${STATE_CLASS[p.state] ?? ''}`}>
                        {STATE_LABELS[p.state] ?? 'Unknown'}
                    </span>
                </div>
                <div className="proposal-proposer">
                    Proposed by <span className="addr">{formatAddr(p.proposer)}</span>
                </div>
            </div>

            <p className="proposal-description">{p.description}</p>

            <div className="vote-bars">
                <div className="vote-row">
                    <span className="vote-label for">For</span>
                    <div className="vote-bar-track">
                        <div
                            className="vote-bar-fill for"
                            style={{ width: `${pct(p.forVotes, total)}%` }}
                        />
                    </div>
                    <span className="vote-count">{p.forVotes.toString()} ({pct(p.forVotes, total)}%)</span>
                </div>
                <div className="vote-row">
                    <span className="vote-label against">Against</span>
                    <div className="vote-bar-track">
                        <div
                            className="vote-bar-fill against"
                            style={{ width: `${pct(p.againstVotes, total)}%` }}
                        />
                    </div>
                    <span className="vote-count">{p.againstVotes.toString()} ({pct(p.againstVotes, total)}%)</span>
                </div>
                <div className="vote-row">
                    <span className="vote-label abstain">Abstain</span>
                    <div className="vote-bar-track">
                        <div
                            className="vote-bar-fill abstain"
                            style={{ width: `${pct(p.abstainVotes, total)}%` }}
                        />
                    </div>
                    <span className="vote-count">{p.abstainVotes.toString()} ({pct(p.abstainVotes, total)}%)</span>
                </div>
            </div>

            <div className="proposal-blocks">
                <span>Block {p.startBlock.toString()} → {p.endBlock.toString()}</span>
                <span>Total votes: {total.toString()}</span>
            </div>

            {txHash && (
                <div className="tx-success">
                    Tx submitted: <span className="tx-hash">{txHash.slice(0, 20)}…</span>
                </div>
            )}
            {localError && <div className="error-msg">{localError}</div>}

            {walletAddress && (
                <div className="proposal-actions">
                    {isActive && (
                        <>
                            <button
                                className="btn btn-vote-for"
                                disabled={isSubmitting}
                                onClick={() => void handleVote(1)}>
                                Vote For
                            </button>
                            <button
                                className="btn btn-vote-against"
                                disabled={isSubmitting}
                                onClick={() => void handleVote(0)}>
                                Vote Against
                            </button>
                            <button
                                className="btn btn-ghost"
                                disabled={isSubmitting}
                                onClick={() => void handleVote(2)}>
                                Abstain
                            </button>
                        </>
                    )}
                    {isSucceeded && (
                        <button
                            className="btn btn-primary"
                            disabled={isSubmitting}
                            onClick={() => void handleExecute()}>
                            Execute
                        </button>
                    )}
                    {(isActive || p.state === 0) && isProposer && (
                        <button
                            className="btn btn-danger"
                            disabled={isSubmitting}
                            onClick={() => void handleCancel()}>
                            Cancel
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
