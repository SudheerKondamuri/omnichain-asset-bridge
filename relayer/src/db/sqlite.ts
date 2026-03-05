import Database from 'better-sqlite3';
import { logger } from '../utils/logger';
import * as path from 'path';
import * as fs from 'fs';

let db: Database.Database;

/**
 * Initialise (or open) the SQLite database.
 * Creates tables on first run.
 */
export function initDatabase(dbPath: string): void {
    logger.info(`Initializing SQLite database at ${dbPath}`);

    // Ensure the parent directory exists
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    db = new Database(dbPath);

    // WAL mode for better concurrent read performance
    db.pragma('journal_mode = WAL');

    db.exec(`
        CREATE TABLE IF NOT EXISTS processed_events (
            id          INTEGER  PRIMARY KEY AUTOINCREMENT,
            chain_id    INTEGER  NOT NULL,
            nonce       TEXT     NOT NULL,  -- TEXT: uint256 can exceed JS Number precision
            event_type  TEXT     NOT NULL,
            tx_hash     TEXT     NOT NULL,
            processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(chain_id, nonce, event_type)
        );

        CREATE TABLE IF NOT EXISTS processed_proposals (
            id          INTEGER  PRIMARY KEY AUTOINCREMENT,
            chain_id    INTEGER  NOT NULL,
            proposal_id TEXT     NOT NULL,  -- TEXT: same precision concern as nonce
            tx_hash     TEXT     NOT NULL,
            processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(chain_id, proposal_id)
        );

        CREATE TABLE IF NOT EXISTS latest_blocks (
            chain_id     INTEGER PRIMARY KEY,
            block_number INTEGER NOT NULL
        );
    `);

    logger.info('Database initialized');
}

// ── Event nonce tracking ──────────────────────────────────────────

export function checkIfProcessed(nonce: string, chainId: number, eventType: string): boolean {
    const row = db.prepare(
        'SELECT id FROM processed_events WHERE chain_id = ? AND nonce = ? AND event_type = ?'
    ).get(chainId, nonce, eventType);
    return !!row;
}

export function markAsProcessed(nonce: string, chainId: number, eventType: string, txHash: string): void {
    db.prepare(
        'INSERT OR IGNORE INTO processed_events (chain_id, nonce, event_type, tx_hash) VALUES (?, ?, ?, ?)'
    ).run(chainId, nonce, eventType, txHash);
    logger.info(`Marked event as processed: chainId=${chainId}, nonce=${nonce}, type=${eventType}`);
}

// ── Proposal tracking ─────────────────────────────────────────────

export function checkIfProposalProcessed(proposalId: string, chainId: number): boolean {
    const row = db.prepare(
        'SELECT id FROM processed_proposals WHERE chain_id = ? AND proposal_id = ?'
    ).get(chainId, proposalId);
    return !!row;
}

export function markProposalAsProcessed(proposalId: string, chainId: number, txHash: string): void {
    db.prepare(
        'INSERT OR IGNORE INTO processed_proposals (chain_id, proposal_id, tx_hash) VALUES (?, ?, ?)'
    ).run(chainId, proposalId, txHash);
    logger.info(`Marked proposal as processed: chainId=${chainId}, proposalId=${proposalId}`);
}

// ── Block cursor (for crash recovery) ─────────────────────────────

export function getLatestProcessedBlock(chainId: number): number {
    const row = db.prepare(
        'SELECT block_number FROM latest_blocks WHERE chain_id = ?'
    ).get(chainId) as { block_number: number } | undefined;
    return row?.block_number ?? 0;
}

export function saveLatestBlock(chainId: number, blockNumber: bigint): void {
    db.prepare(
        'INSERT OR REPLACE INTO latest_blocks (chain_id, block_number) VALUES (?, ?)'
    ).run(chainId, Number(blockNumber));
}

