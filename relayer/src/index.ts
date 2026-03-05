import { config } from './config';
import { initDatabase } from './db/sqlite';
import { startChainAListener } from './listeners/chainAListener';
import { startChainBListener } from './listeners/chainBListener';
import { logger } from './utils/logger';

async function main() {
    logger.info('Starting Relayer Service…');
    logger.info(`Chain A RPC: ${config.chainA.rpcUrl}  (chainId ${config.chainA.chainId})`);
    logger.info(`Chain B RPC: ${config.chainB.rpcUrl}  (chainId ${config.chainB.chainId})`);
    logger.info(`Confirmation depth: ${config.confirmationDepth}`);

    try {
        // Initialize SQLite persistence
        initDatabase(config.dbPath);

        // Start listeners (they never resolve — they poll forever)
        await Promise.all([
            startChainAListener(),
            startChainBListener()
        ]);

        logger.info('Relayer service started successfully');
    } catch (error) {
        logger.error('Failed to start relayer service:', error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    logger.info('Shutting down relayer service...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    logger.info('Shutting down relayer service...');
    process.exit(0);
});

main();
