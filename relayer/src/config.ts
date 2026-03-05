import { defineChain, createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './utils/logger';

// ── Environment variables ──────────────────────────────────────
const CHAIN_A_RPC = process.env.CHAIN_A_RPC_URL || 'http://127.0.0.1:8545';
const CHAIN_B_RPC = process.env.CHAIN_B_RPC_URL || 'http://127.0.0.1:9545';
const PRIVATE_KEY = (
  process.env.DEPLOYER_PRIVATE_KEY ||
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
) as `0x${string}`;
const CONFIRMATION_DEPTH = Number(process.env.CONFIRMATION_DEPTH || '3');
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/relayer.db');

// ── Load deployed addresses (written by scripts/deploy.js) ────
const ADDRESSES_PATH = process.env.ADDRESSES_PATH || path.join(__dirname, '../data/addresses.json');

interface DeployedAddresses {
  chainA: { chainId: number; vaultToken: string; bridgeLock: string; governanceEmergency?: string };
  chainB: { chainId: number; wrappedVaultToken: string; bridgeMint: string; governanceVoting?: string };
}

let addresses: DeployedAddresses;
try {
  addresses = JSON.parse(fs.readFileSync(ADDRESSES_PATH, 'utf-8'));
  logger.info(`Loaded deployed addresses from ${ADDRESSES_PATH}`);
} catch {
  // Fallback: read individual addresses from env vars
  addresses = {
    chainA: {
      chainId: Number(process.env.CHAIN_A_CHAIN_ID || '1111'),
      vaultToken: process.env.VAULT_TOKEN_ADDR || '',
      bridgeLock: process.env.BRIDGE_LOCK_ADDR || '',
      governanceEmergency: process.env.GOVERNANCE_EMERGENCY_ADDR || '',
    },
    chainB: {
      chainId: Number(process.env.CHAIN_B_CHAIN_ID || '2222'),
      wrappedVaultToken: process.env.WRAPPED_VAULT_TOKEN_ADDR || '',
      bridgeMint: process.env.BRIDGE_MINT_ADDR || '',
      governanceVoting: process.env.GOVERNANCE_VOTING_ADDR || '',
    },
  };
  logger.warn('addresses.json not found – falling back to env vars');
}

// ── Chain definitions ──────────────────────────────────────────
export const chainADef = defineChain({
  id: addresses.chainA.chainId,
  name: 'ChainA-Local',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [CHAIN_A_RPC] } },
});

export const chainBDef = defineChain({
  id: addresses.chainB.chainId,
  name: 'ChainB-Local',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [CHAIN_B_RPC] } },
});

// ── Viem clients ───────────────────────────────────────────────
export const publicClientA = createPublicClient({
  chain: chainADef,
  transport: http(CHAIN_A_RPC),
});

export const publicClientB = createPublicClient({
  chain: chainBDef,
  transport: http(CHAIN_B_RPC),
});

const account = privateKeyToAccount(PRIVATE_KEY);
export const relayerAccount = account;

export const walletClientA = createWalletClient({
  account,
  chain: chainADef,
  transport: http(CHAIN_A_RPC),
});

export const walletClientB = createWalletClient({
  account,
  chain: chainBDef,
  transport: http(CHAIN_B_RPC),
});

// ── Exported config object ─────────────────────────────────────
export const config = {
  confirmationDepth: CONFIRMATION_DEPTH,
  dbPath: DB_PATH,
  chainA: {
    chainId: addresses.chainA.chainId,
    rpcUrl: CHAIN_A_RPC,
    bridgeLockAddress: addresses.chainA.bridgeLock as `0x${string}`,
    governanceEmergencyAddress: (addresses.chainA.governanceEmergency || '') as `0x${string}`,
  },
  chainB: {
    chainId: addresses.chainB.chainId,
    rpcUrl: CHAIN_B_RPC,
    bridgeMintAddress: addresses.chainB.bridgeMint as `0x${string}`,
    governanceVotingAddress: (addresses.chainB.governanceVoting || '') as `0x${string}`,
  },
};