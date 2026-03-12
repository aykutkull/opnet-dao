export function TreasuryPanel(): JSX.Element {
    return (
        <section className="section">
            <h2 className="section-title">Treasury</h2>
            <div className="treasury-grid">
                <div className="treasury-card">
                    <div className="treasury-icon">₿</div>
                    <div className="treasury-label">BTC Balance</div>
                    <div className="treasury-value">—</div>
                    <div className="treasury-sub">Connect wallet to view</div>
                </div>
                <div className="treasury-card">
                    <div className="treasury-icon">🗳</div>
                    <div className="treasury-label">GOV Supply</div>
                    <div className="treasury-value">100M</div>
                    <div className="treasury-sub">Max governance tokens</div>
                </div>
                <div className="treasury-card">
                    <div className="treasury-icon">⚡</div>
                    <div className="treasury-label">Network</div>
                    <div className="treasury-value">Bitcoin L1</div>
                    <div className="treasury-sub">Powered by OPNet</div>
                </div>
                <div className="treasury-card">
                    <div className="treasury-icon">📜</div>
                    <div className="treasury-label">Quorum</div>
                    <div className="treasury-value">4%</div>
                    <div className="treasury-sub">Of circulating supply</div>
                </div>
            </div>

            <div className="dao-info">
                <h3>About OPNet DAO</h3>
                <p>
                    OPNet DAO is a fully on-chain governance protocol running on Bitcoin Layer 1 via OPNet.
                    GOV token holders can propose, vote on, and execute changes directly on Bitcoin —
                    no sidechains, no bridges, no compromises.
                </p>
                <ul>
                    <li>Proposals are open for voting for the configured voting period (in blocks)</li>
                    <li>A proposal passes when For votes exceed Against votes</li>
                    <li>Passed proposals can be executed by any member</li>
                    <li>Proposers can cancel their own proposals before execution</li>
                </ul>
            </div>
        </section>
    );
}
