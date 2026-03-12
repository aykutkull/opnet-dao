import { useEffect } from 'react';
import { useDAO } from '../hooks/useDAO';
import { ProposalCard } from './ProposalCard';

export function ProposalList(): JSX.Element {
    const { proposals, isLoading, error, loadProposals } = useDAO();

    useEffect(() => {
        void loadProposals();
    }, [loadProposals]);

    return (
        <section className="section">
            <div className="section-header">
                <h2 className="section-title">Proposals</h2>
                <button
                    className="btn btn-ghost btn-sm"
                    disabled={isLoading}
                    onClick={() => void loadProposals()}>
                    {isLoading ? 'Loading…' : 'Refresh'}
                </button>
            </div>

            {error && <div className="error-msg">{error}</div>}

            {!isLoading && proposals.length === 0 && !error && (
                <div className="empty-state">
                    <div className="empty-icon">📋</div>
                    <p>No proposals yet. Be the first to create one!</p>
                </div>
            )}

            <div className="proposal-list">
                {proposals.map((p) => (
                    <ProposalCard key={p.id} proposal={p} onRefresh={() => void loadProposals()} />
                ))}
            </div>
        </section>
    );
}
