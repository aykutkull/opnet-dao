import { useState } from 'react';
import { useDAO } from '../hooks/useDAO';
import { useOpNet } from '../hooks/useOpNet';

interface Props {
    readonly onCreated: () => void;
}

export function CreateProposal({ onCreated }: Props): JSX.Element {
    const { walletAddress } = useOpNet();
    const { createProposal, isSubmitting, error } = useDAO();
    const [description, setDescription] = useState('');
    const [txHash, setTxHash] = useState<string | null>(null);
    const [localError, setLocalError] = useState<string | null>(null);

    async function handleSubmit(e: React.FormEvent): Promise<void> {
        e.preventDefault();
        if (!description.trim()) return;

        setLocalError(null);
        setTxHash(null);

        const tx = await createProposal(description.trim());
        if (tx) {
            setTxHash(tx);
            setDescription('');
            onCreated();
        } else {
            setLocalError(error ?? 'Transaction failed');
        }
    }

    if (!walletAddress) {
        return (
            <section className="section">
                <h2 className="section-title">Create Proposal</h2>
                <div className="connect-prompt">
                    Connect your OPWallet to create a proposal.
                </div>
            </section>
        );
    }

    return (
        <section className="section">
            <h2 className="section-title">Create Proposal</h2>
            <form className="create-form" onSubmit={(e) => void handleSubmit(e)}>
                <label className="form-label" htmlFor="desc">
                    Proposal Description
                    <span className="char-count">{description.length}/500</span>
                </label>
                <textarea
                    id="desc"
                    className="form-textarea"
                    placeholder="Describe your proposal clearly. What should the DAO do, and why?"
                    value={description}
                    maxLength={500}
                    rows={6}
                    onChange={(e) => setDescription(e.target.value)}
                />
                <div className="form-hint">
                    Proposals are permanent and visible to all DAO members. Voting opens immediately after submission.
                </div>

                {txHash && (
                    <div className="tx-success">
                        Proposal created! Tx: <span className="tx-hash">{txHash.slice(0, 24)}…</span>
                    </div>
                )}
                {localError && <div className="error-msg">{localError}</div>}

                <button
                    type="submit"
                    className="btn btn-primary btn-full"
                    disabled={isSubmitting || description.trim().length === 0}>
                    {isSubmitting ? 'Submitting…' : 'Submit Proposal'}
                </button>
            </form>
        </section>
    );
}
