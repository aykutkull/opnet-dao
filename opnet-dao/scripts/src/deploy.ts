/**
 * OPNet DAO — Deployment Script
 *
 * Deploys both contracts in order:
 *   1. GovernanceToken  (OP20 GOV token)
 *   2. DAOGovernor      (governance contract)
 *
 * Usage:
 *   MNEMONIC="your 24 words" npx tsx src/deploy.ts
 *
 * After deployment, paste the printed addresses into:
 *   frontend/src/config/contracts.ts
 *
 * Rules:
 *   - TransactionFactory is ONLY used for deployments
 *   - For contract CALLS: getContract → simulate → sendTransaction
 *   - Network: networks.opnetTestnet
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    Address,
    AddressTypes,
    MLDSASecurityLevel,
    Mnemonic,
    TransactionFactory,
} from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';
import { JSONRpcProvider, getContract } from 'opnet';

// ─── Config ───────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BUILD_DIR = join(__dirname, '..', '..', 'contracts', 'build');

const NETWORK = networks.opnetTestnet;
const RPC_URL = 'https://testnet.opnet.org';
const FEE_RATE = 10;       // sat/vByte
const MAX_SAT  = 1_000_000n;

// ─── DAO Parameters ───────────────────────────────────────────────────────────

const VOTING_PERIOD_BLOCKS = 144n; // ~1 day on Bitcoin
const QUORUM_BPS            = 400n; // 4% of total supply

// ─── ABI for initial mint ─────────────────────────────────────────────────────

const MINT_ABI = [
    {
        name: 'mint',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'to', type: 'address' },
            { name: 'amount', type: 'uint256' },
        ],
        outputs: [{ name: 'success', type: 'bool' }],
    },
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadWasm(name: string): Uint8Array {
    const path = join(BUILD_DIR, `${name}.wasm`);
    return new Uint8Array(readFileSync(path).buffer);
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function deployContract(
    factory: TransactionFactory,
    wasm: Uint8Array,
    calldata: Uint8Array,
    name: string,
): Promise<string> {
    console.log(`\nDeploying ${name}…`);

    const tx = await factory.deploy({
        bytecode: wasm,
        calldata,
        feeRate: FEE_RATE,
        network: NETWORK,
        maximumAllowedSatToSpend: MAX_SAT,
    });

    console.log(`  TX:               ${tx.transactionId}`);
    console.log(`  Contract address: ${tx.contractAddress ?? 'pending'}`);

    await sleep(4000);
    return tx.contractAddress ?? tx.transactionId;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    const mnemonicStr = process.env['MNEMONIC'];
    if (!mnemonicStr) throw new Error('Set MNEMONIC env variable');

    const mnemonic = new Mnemonic(
        mnemonicStr,
        '',
        NETWORK,
        MLDSASecurityLevel.LEVEL2,
    );
    const wallet = mnemonic.deriveOPWallet(AddressTypes.P2TR, 0);
    console.log('Deployer address:', wallet.p2tr);

    const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });
    const blockNumber = await provider.getBlockNumber();
    console.log('Connected. Block:', blockNumber);

    const balance = await provider.getBalance(wallet.p2tr);
    console.log('Balance (sats):', balance.toString());

    const txFactory = new TransactionFactory({
        signer: wallet.keypair,
        mldsaSigner: wallet.mldsaKeypair,
        refundTo: wallet.p2tr,
        provider,
        network: NETWORK,
    });

    // ── 1. Deploy GovernanceToken ─────────────────────────────────────────────
    const tokenWasm = loadWasm('GovernanceToken');
    const govTokenAddress = await deployContract(txFactory, tokenWasm, new Uint8Array(0), 'GovernanceToken');

    // ── 2. Deploy DAOGovernor ────────────────────────────────────────────────
    // Calldata: govToken (Address, 33 bytes) + votingPeriod (u256, 32 bytes) + quorumBps (u256, 32 bytes)
    const governorWasm = loadWasm('DAOGovernor');

    const govTokenAddr = Address.fromString(govTokenAddress);
    const governorCalldata = new Uint8Array(33 + 32 + 32);

    // govToken address (33 bytes)
    governorCalldata.set(govTokenAddr.toBytes(), 0);

    // votingPeriod as big-endian u256 (32 bytes)
    const vpBytes = new Uint8Array(32);
    const vpBig = VOTING_PERIOD_BLOCKS;
    for (let i = 0; i < 8; i++) {
        vpBytes[31 - i] = Number((vpBig >> BigInt(i * 8)) & 0xffn);
    }
    governorCalldata.set(vpBytes, 33);

    // quorumBps as big-endian u256 (32 bytes)
    const qBytes = new Uint8Array(32);
    const qBig = QUORUM_BPS;
    for (let i = 0; i < 8; i++) {
        qBytes[31 - i] = Number((qBig >> BigInt(i * 8)) & 0xffn);
    }
    governorCalldata.set(qBytes, 65);

    const governorAddress = await deployContract(txFactory, governorWasm, governorCalldata, 'DAOGovernor');

    // ── 3. Mint initial GOV tokens to deployer ────────────────────────────────
    console.log('\nMinting initial 1,000,000 GOV to deployer…');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tokenContract = getContract<any>(govTokenAddress, MINT_ABI, provider, NETWORK, wallet.p2tr);
    const MINT_AMOUNT = 1_000_000n * 10n ** 18n;
    const mintSim = await tokenContract.mint(wallet.p2tr, MINT_AMOUNT);

    if (mintSim.revert) {
        console.warn('  Mint simulation reverted:', mintSim.revert);
    } else {
        const mintTx = await mintSim.sendTransaction({
            signer: wallet.keypair,
            mldsaSigner: wallet.mldsaKeypair,
            refundTo: wallet.p2tr,
            maximumAllowedSatToSpend: MAX_SAT,
            feeRate: FEE_RATE,
            network: NETWORK,
        });
        console.log('  Mint TX:', mintTx.transactionId);
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    console.log('\n════════════════════════════════════════');
    console.log('  OPNet DAO Deployment Complete (Testnet)');
    console.log('════════════════════════════════════════');
    console.log(JSON.stringify({ govToken: govTokenAddress, governor: governorAddress }, null, 2));
    console.log('\nPaste these into: frontend/src/config/contracts.ts');
    console.log('════════════════════════════════════════\n');

    provider.close();
}

main().catch((err: unknown) => {
    console.error('Deployment failed:', err);
    process.exit(1);
});
