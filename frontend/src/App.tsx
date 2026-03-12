import { useState } from 'react';
import { WalletConnect } from './components/WalletConnect';
import { ProposalList } from './components/ProposalList';
import { CreateProposal } from './components/CreateProposal';
import { TreasuryPanel } from './components/TreasuryPanel';

type Tab = 'proposals' | 'create' | 'treasury';

export function App(): JSX.Element {
    const [tab, setTab] = useState<Tab>('proposals');

    return (
        <div className="app">
            {/* ── Header ──────────────────────────────────────── */}
            <header className="header">
                <div className="header-left">
                    <div className="logo">
                        <span className="logo-icon">⛓</span>
                        <div className="logo-text">
                            <span className="logo-name">OPNet DAO</span>
                            <span className="logo-sub">Bitcoin Governance</span>
                        </div>
                    </div>
                    <nav className="nav">
                        {(['proposals', 'create', 'treasury'] as Tab[]).map((t) => (
                            <button
                                key={t}
                                className={`nav-btn${tab === t ? ' active' : ''}`}
                                onClick={() => setTab(t)}>
                                {t === 'proposals' && 'Proposals'}
                                {t === 'create' && '+ New Proposal'}
                                {t === 'treasury' && 'Treasury'}
                            </button>
                        ))}
                    </nav>
                </div>
                <WalletConnect />
            </header>

            {/* ── Hero banner ─────────────────────────────────── */}
            {tab === 'proposals' && (
                <div className="hero">
                    <div className="hero-content">
                        <div className="hero-badge">The Breakthrough</div>
                        <h1 className="hero-title">
                            Everything that ran on ETH &amp; SOL —<br />
                            <span className="accent">now on Bitcoin.</span>
                        </h1>
                        <p className="hero-sub">
                            Decentralized governance, fully on-chain on Bitcoin Layer 1 via OPNet.
                        </p>
                    </div>
                    <div className="hero-orb" />
                </div>
            )}

            {/* ── Main content ────────────────────────────────── */}
            <main className="main">
                {tab === 'proposals' && <ProposalList />}
                {tab === 'create' && <CreateProposal onCreated={() => setTab('proposals')} />}
                {tab === 'treasury' && <TreasuryPanel />}
            </main>

            <footer className="footer">
                <p>
                    OPNet DAO — Built on{' '}
                    <a href="https://opnet.org" target="_blank" rel="noreferrer">OPNet</a>
                    {' '}· Bitcoin L1 · The Breakthrough Hackathon 2025
                </p>
            </footer>
        </div>
    );
}
