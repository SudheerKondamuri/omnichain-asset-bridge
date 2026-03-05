import { parseAbiItem } from 'viem';
import { publicClientB, config } from '../config';
import { getLatestProcessedBlock, saveLatestBlock } from '../db/sqlite';
import { BridgeMintABI } from '../abis/BridgeMint';
import { GovernanceVotingABI } from '../abis/GovernanceVoting';
import { handleBurned } from '../handlers/handleBurned';
import { handleProposal } from '../handlers/handleProposal';
import { logger } from '../utils/logger';

/**
 * Listens for `Burned` events on BridgeMint and `ProposalPassed` events
 * on GovernanceVoting (both on Chain B).
 */
export async function startChainBListener(): Promise<void> {
    const chainId = config.chainB.chainId;
    const bridgeMintAddr = config.chainB.bridgeMintAddress;
    const govVotingAddr = config.chainB.governanceVotingAddress;

    if (!bridgeMintAddr) {
        logger.warn('Chain B BridgeMint address not configured — skipping listener');
        return;
    }

    logger.info(`Starting Chain B listener on BridgeMint=${bridgeMintAddr}`);

    // ── 1. CATCH-UP PHASE ─────────────────────────────────────────
    const lastBlock = BigInt(getLatestProcessedBlock(chainId));
    const currentBlock = await publicClientB.getBlockNumber();

    if (currentBlock > lastBlock) {
        logger.info(`[Chain B] Syncing missed events from block ${lastBlock + 1n} to ${currentBlock}…`);

        // Replay Burned events
        const missedBurned = await publicClientB.getLogs({
            address: bridgeMintAddr,
            event: parseAbiItem(
                'event Burned(address indexed user, uint256 amount, uint256 nonce, uint256 destinationChainId)'
            ),
            fromBlock: lastBlock > 0n ? lastBlock + 1n : 0n,
            toBlock: currentBlock,
        });

        for (const log of missedBurned) {
            await handleBurned(
                log.args.user!,
                log.args.amount!,
                log.args.nonce!,
                log.args.destinationChainId!,
                log.transactionHash,
                log.blockNumber,
            );
        }

        // Replay ProposalPassed events (if governance contract configured)
        if (govVotingAddr) {
            const missedProposals = await publicClientB.getLogs({
                address: govVotingAddr,
                event: parseAbiItem(
                    'event ProposalPassed(uint256 indexed id, uint8 action)'
                ),
                fromBlock: lastBlock > 0n ? lastBlock + 1n : 0n,
                toBlock: currentBlock,
            });

            for (const log of missedProposals) {
                await handleProposal(
                    log.args.id!,
                    log.args.action!,
                    log.transactionHash,
                    log.blockNumber,
                );
            }
        }

        saveLatestBlock(chainId, currentBlock);
    }

    // ── 2. LIVE PHASE — Burned events ─────────────────────────────
    logger.info('[Chain B] Watching for Burned events…');

    publicClientB.watchContractEvent({
        address: bridgeMintAddr,
        abi: BridgeMintABI,
        eventName: 'Burned',
        pollingInterval: 2_000,
        onLogs: async (logs) => {
            for (const log of logs) {
                await handleBurned(
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
            logger.error('[Chain B] Watch Burned error:', error);
        },
    });

    // ── 3. LIVE PHASE — ProposalPassed events ─────────────────────
    if (govVotingAddr) {
        logger.info('[Chain B] Watching for ProposalPassed events…');

        publicClientB.watchContractEvent({
            address: govVotingAddr,
            abi: GovernanceVotingABI,
            eventName: 'ProposalPassed',
            pollingInterval: 2_000,
            onLogs: async (logs) => {
                for (const log of logs) {
                    await handleProposal(
                        log.args.id!,
                        log.args.action!,
                        log.transactionHash,
                        log.blockNumber,
                    );
                    saveLatestBlock(chainId, log.blockNumber);
                }
            },
            onError: (error) => {
                logger.error('[Chain B] Watch ProposalPassed error:', error);
            },
        });
    }

    logger.info('[Chain B] Listener started');
}

