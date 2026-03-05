import { publicClientA, publicClientB, walletClientA, config } from '../config';
import { waitForConfirmations } from '../utils/confirmations';
import { retryWithBackoff } from '../utils/retry';
import { checkIfProposalProcessed, markProposalAsProcessed } from '../db/sqlite';
import { GovernanceEmergencyABI } from '../abis/GovernanceEmergency';
import { logger } from '../utils/logger';

/**
 * Handles a `ProposalPassed` event from GovernanceVoting on Chain B.
 * Calls `executeAction()` on GovernanceEmergency (Chain A) to pause/unpause the bridge.
 */
export async function handleProposal(
    proposalId: bigint,
    action: number,
    txHash: `0x${string}`,
    blockNumber: bigint,
): Promise<void> {
    const pidStr = proposalId.toString();
    const sourceChainId = config.chainB.chainId;

    logger.info(
        `[handleProposal] proposalId=${pidStr} action=${action} tx=${txHash}`
    );

    // 1. Idempotency check
    if (checkIfProposalProcessed(pidStr, sourceChainId)) {
        logger.info(`[handleProposal] proposalId=${pidStr} already processed — skipping`);
        return;
    }

    if (!config.chainA.governanceEmergencyAddress) {
        logger.warn('[handleProposal] GovernanceEmergency address not configured — skipping');
        return;
    }

    // 2. Wait for confirmation depth
    await waitForConfirmations(publicClientB, blockNumber, config.confirmationDepth);

    // 3. Execute governance action on Chain A
    await retryWithBackoff(async () => {
        const txHash = await walletClientA.writeContract({
            address: config.chainA.governanceEmergencyAddress,
            abi: GovernanceEmergencyABI,
            functionName: 'executeAction',
            args: [proposalId, BigInt(sourceChainId), action],
        });

        const receipt = await publicClientA.waitForTransactionReceipt({ hash: txHash });
        logger.info(`[handleProposal] executeAction tx mined: ${receipt.transactionHash} (block ${receipt.blockNumber})`);
    });

    // 4. Persist
    markProposalAsProcessed(pidStr, sourceChainId, txHash);
    logger.info(`[handleProposal] Successfully executed proposalId=${pidStr}`);
}
