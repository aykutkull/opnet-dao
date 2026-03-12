import { useWalletConnect, SupportedWallets } from '@btc-vision/walletconnect';
import { networks } from '@btc-vision/bitcoin';

function formatAddress(addr: string): string {
    if (addr.length <= 12) return addr;
    return `${addr.slice(0, 6)}…${addr.slice(-6)}`;
}

function networkLabel(network: unknown): string {
    if (network === networks.bitcoin) return 'Mainnet';
    if (network === networks.opnetTestnet) return 'Testnet';
    return 'Unknown';
}

export function WalletConnect(): JSX.Element {
    const { isConnected, address, network, connectToWallet, disconnect } = useWalletConnect();

    if (isConnected && address) {
        return (
            <div className="wallet-connected">
                <div className="network-chip">
                    <span className="network-dot" />
                    {networkLabel(network)}
                </div>
                <span className="wallet-address">{formatAddress(address)}</span>
                <button className="btn btn-ghost" onClick={() => void disconnect()}>
                    Disconnect
                </button>
            </div>
        );
    }

    return (
        <button
            className="btn btn-primary"
            onClick={() => void connectToWallet(SupportedWallets.OP_WALLET)}>
            Connect Wallet
        </button>
    );
}
