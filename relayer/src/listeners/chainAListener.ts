import { parseAbiItem } from 'viem';
import { publicClientA, config } from '../config';
import { getLatestProcessedBlock, saveLatestBlock } from '../db/sqlite';
import { BridgeLockABI } from '../abis/BridgeLock';
import { handleLocked } from '../handlers/handleLocked';
import { logger } from '../utils/logger';

/**
 * Listens for `Locked` events on BridgeLock (Chain A).
 *  1. Catch-up phase — replays any missed events since the last persisted block.
 *  2. Live phase     — watches for new events via polling.
 */
export async function startChainAListener(): Promise<void> {
    const chainId = config.chainA.chainId;
    const bridgeAddr = config.chainA.bridgeLockAddress;

    if (!bridgeAddr) {
        logger.warn('Chain A BridgeLock address not configured — skipping listener');
        return;
    }

    logger.info(`Starting Chain A listener on ${bridgeAddr}`);

    // ── 1. CATCH-UP PHASE ─────────────────────────────────────────
    const lastBlock = BigInt(getLatestProcessedBlock(chainId));
    const currentBlock = await publicClientA.getBlockNumber();

    if (currentBlock > lastBlock) {
        logger.info(`[Chain A] Syncing missed events from block ${lastBlock + 1n} to ${currentBlock}…`);

        const missedLogs = await publicClientA.getLogs({
            address: bridgeAddr,
            event: parseAbiItem(
                'event Locked(address indexed user, uint256 amount, uint256 nonce, uint256 indexed destinationChainId)'
            ),
            fromBlock: lastBlock > 0n ? lastBlock + 1n : 0n,
            toBlock: currentBlock,
        });

        for (const log of missedLogs) {
            await handleLocked(
                log.args.user!,
                log.args.amount!,
                log.args.nonce!,
                log.args.destinationChainId!,
                log.transactionHash,
                log.blockNumber,
            );
        }

        saveLatestBlock(chainId, currentBlock);
    }

    // ── 2. LIVE PHASE ─────────────────────────────────────────────
    logger.info('[Chain A] Catch-up complete. Watching for new Locked events…');

    publicClientA.watchContractEvent({
        address: bridgeAddr,
        abi: BridgeLockABI,
        eventName: 'Locked',
        pollingInterval: 2_000,
        onLogs: async (logs) => {
            for (const log of logs) {
                await handleLocked(
                    log.args.user!,
                    log.args.amount!,
                    log.args.nonce!,
                    log.args.destinationChainId!,
                    log.transactionHash,
                    log.blockNumber,
                );
                saveLatestBlock(chainId, log.blockNumber);
            }
        },
        onError: (error) => {
            logger.error('[Chain A] Watch error:', error);
        },
    });
}
