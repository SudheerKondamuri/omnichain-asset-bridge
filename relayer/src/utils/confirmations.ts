import { type PublicClient } from 'viem';
import { logger } from './logger';

/**
 * Wait until `blockNumber` has at least `requiredConfirmations` blocks on top.
 * Accepts a pre-built viem PublicClient so we reuse the existing transport.
 */
export async function waitForConfirmations(
    client: PublicClient,
    blockNumber: bigint,
    requiredConfirmations: number
): Promise<void> {
    logger.info(`Waiting for ${requiredConfirmations} confirmation(s) for block ${blockNumber}`);

    // On local anvil nodes blocks are mined per-tx; fast-poll.
    while (true) {
        const currentBlock = await client.getBlockNumber();
        const confirmations = Number(currentBlock - blockNumber);

        if (confirmations >= requiredConfirmations) {
            logger.info(`Block ${blockNumber} has ${confirmations} confirmation(s)`);
            return;
        }

        logger.debug(
            `Block ${blockNumber}: ${confirmations}/${requiredConfirmations} confirmations, waiting…`
        );
        await new Promise((r) => setTimeout(r, 2_000));
    }
}
