import { type Network, networks } from '@btc-vision/bitcoin';

// ─── Contract address registry ────────────────────────────────────────────────

export interface DAOAddresses {
    readonly govToken: string;
    readonly governor: string;
}

/**
 * Fill in your deployed contract addresses after running scripts/deploy.ts.
 *
 * Testnet:  networks.opnetTestnet
 * Mainnet:  networks.bitcoin
 */
const ADDRESSES: Map<Network, DAOAddresses> = new Map([
    [
        networks.opnetTestnet,
        {
            govToken: 'REPLACE_AFTER_DEPLOY_TESTNET_GOV_TOKEN',
            governor: 'REPLACE_AFTER_DEPLOY_TESTNET_GOVERNOR',
        },
    ],
    [
        networks.bitcoin,
        {
            govToken: 'REPLACE_AFTER_DEPLOY_MAINNET_GOV_TOKEN',
            governor: 'REPLACE_AFTER_DEPLOY_MAINNET_GOVERNOR',
        },
    ],
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getAddresses(network: Network): DAOAddresses {
    const addrs = ADDRESSES.get(network);
    if (!addrs) throw new Error('OPNet DAO: no addresses for network');
    return addrs;
}

export function getRpcUrl(network: Network): string {
    if (network === networks.bitcoin) return 'https://mainnet.opnet.org';
    return 'https://testnet.opnet.org';
}
