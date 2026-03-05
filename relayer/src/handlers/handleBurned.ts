import { publicClientA, publicClientB, walletClientA, config } from '../config';
import { waitForConfirmations } from '../utils/confirmations';
import { retryWithBackoff } from '../utils/retry';
import { checkIfProcessed, markAsProcessed } from '../db/sqlite';
import { BridgeLockABI } from '../abis/BridgeLock';
import { logger } from '../utils/logger';

/**
 * Handles a `Burned` event from BridgeMint on Chain B.
 * After waiting for confirmations, calls `unlock()` on BridgeLock (Chain A).
 */
export async function handleBurned(
    user: `0x${string}`,
    amount: bigint,
    nonce: bigint,
    destinationChainId: bigint,
    txHash: `0x${string}`,
    blockNumber: bigint,
): Promise<void> {
    const nonceNum = Number(nonce);
    const sourceChainId = config.chainB.chainId;

    logger.info(
        `[handleBurned] user=${user} amount=${amount} nonce=${nonceNum} destChain=${destinationChainId} tx=${txHash}`
    );

    // 1. Idempotency check
    if (checkIfProcessed(nonceNum, sourceChainId, 'Burned')) {
        logger.info(`[handleBurned] nonce=${nonceNum} already processed — skipping`);
        return;
    }

    // 2. Wait for confirmation depth
    await waitForConfirmations(publicClientB, blockNumber, config.confirmationDepth);

    // 3. Call unlock on Chain A
    await retryWithBackoff(async () => {
        const txHash = await walletClientA.writeContract({
            address: config.chainA.bridgeLockAddress,
            abi: BridgeLockABI,
            functionName: 'unlock',
            args: [user, amount, nonce, BigInt(sourceChainId)],
        });

        const receipt = await publicClientA.waitForTransactionReceipt({ hash: txHash });
        logger.info(`[handleBurned] unlock tx mined: ${receipt.transactionHash} (block ${receipt.blockNumber})`);
    });

    // 4. Persist
    markAsProcessed(nonceNum, sourceChainId, 'Burned', txHash);
    logger.info(`[handleBurned] Successfully processed nonce=${nonceNum}`);
}
