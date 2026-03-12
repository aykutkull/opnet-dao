import { Blockchain } from '@btc-vision/btc-runtime/runtime';
import { revertOnError } from '@btc-vision/btc-runtime/runtime/abort/abort';
import { GovernanceToken } from './GovernanceToken';

// DO NOT TOUCH THIS — only change the contract class name.
Blockchain.contract = () => {
    return new GovernanceToken();
};

// VERY IMPORTANT — re-export runtime ABI entry points
export * from '@btc-vision/btc-runtime/runtime/exports';

// VERY IMPORTANT — route AssemblyScript aborts through OPNet revert mechanism
export function abort(message: string, fileName: string, line: u32, column: u32): void {
    revertOnError(message, fileName, line, column);
}
