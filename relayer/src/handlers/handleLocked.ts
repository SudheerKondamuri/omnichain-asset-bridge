import { publicClientA, publicClientB, walletClientB, config } from '../config';
import { waitForConfirmations } from '../utils/confirmations';
import { retryWithBackoff } from '../utils/retry';
import { checkIfProcessed, markAsProcessed } from '../db/sqlite';
import { BridgeMintABI } from '../abis/BridgeMint';
import { logger } from '../utils/logger';

/**
 * Handles a `Locked` event from BridgeLock on Chain A.
 * After waiting for confirmations, calls `mintWrapped()` on BridgeMint (Chain B).
 */
export async function handleLocked(
    user: `0x${string}`,
    amount: bigint,
    nonce: bigint,
    destinationChainId: bigint,
    txHash: `0x${string}`,
    blockNumber: bigint,
): Promise<void> {
    const nonceNum = Number(nonce);
    const sourceChainId = config.chainA.chainId;

    logger.info(
        `[handleLocked] user=${user} amount=${amount} nonce=${nonceNum} destChain=${destinationChainId} tx=${txHash}`
    );

    // 1. Check if already processed (idempotent)
    if (checkIfProcessed(nonceNum, sourceChainId, 'Locked')) {
        logger.info(`[handleLocked] nonce=${nonceNum} already processed — skipping`);
        return;
    }

    // 2. Wait for confirmation depth
    await waitForConfirmations(publicClientA, blockNumber, config.confirmationDepth);

    // 3. Call mintWrapped on Chain B via the relayer wallet
    await retryWithBackoff(async () => {
        const txHash = await walletClientB.writeContract({
            address: config.chainB.bridgeMintAddress,
            abi: BridgeMintABI,
            functionName: 'mintWrapped',
            args: [user, amount, nonce, BigInt(sourceChainId)],
        });

        // Wait for the tx to be mined
        const receipt = await publicClientB.waitForTransactionReceipt({ hash: txHash });
        logger.info(`[handleLocked] mintWrapped tx mined: ${receipt.transactionHash} (block ${receipt.blockNumber})`);
    });

    // 4. Mark as processed in DB
    markAsProcessed(nonceNum, sourceChainId, 'Locked', txHash);
    logger.info(`[handleLocked] Successfully processed nonce=${nonceNum}`);
}
