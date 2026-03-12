import { useCallback, useEffect, useMemo, useState } from 'react';
import { type Network, networks } from '@btc-vision/bitcoin';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { JSONRpcProvider } from 'opnet';
import { getRpcUrl } from '../config/contracts';

interface UseOpNetReturn {
    readonly provider: JSONRpcProvider | null;
    readonly network: Network;
    readonly walletAddress: string | null;
    readonly isConnected: boolean;
    readonly switchNetwork: (network: Network) => void;
}

export function useOpNet(): UseOpNetReturn {
    const { isConnected, address, network: walletNetwork } = useWalletConnect();
    const [network, setNetwork] = useState<Network>(networks.opnetTestnet);

    useEffect(() => {
        if (isConnected && walletNetwork && walletNetwork !== network) {
            setNetwork(walletNetwork);
        }
    }, [isConnected, walletNetwork, network]);

    const provider = useMemo<JSONRpcProvider | null>(() => {
        try {
            return new JSONRpcProvider({ url: getRpcUrl(network), network });
        } catch {
            return null;
        }
    }, [network]);

    const switchNetwork = useCallback((next: Network) => {
        setNetwork(next);
    }, []);

    return {
        provider,
        network,
        walletAddress: address ?? null,
        isConnected,
        switchNetwork,
    };
}
