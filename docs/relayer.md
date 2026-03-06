# Relayer Service

The relayer is a TypeScript Node.js service that bridges events between Chain A and Chain B. It is the only component that communicates with both chains simultaneously.

---

## Overview

```
relayer/src/
├── index.ts              # Entry point — wires everything together
├── config.ts             # Env vars, viem clients, address loading
├── listeners/
│   ├── chainAListener.ts # Polls BridgeLock & GovernanceEmergency on Chain A
│   └── chainBListener.ts # Polls BridgeMint & GovernanceVoting on Chain B
├── handlers/
│   ├── handleLocked.ts   # Lock event → mintWrapped on Chain B
│   ├── handleBurned.ts   # Burn event → unlock on Chain A
│   └── handleProposal.ts # ProposalPassed event → executeAction on Chain A
├── db/
│   └── sqlite.ts         # SQLite idempotency store
└── utils/
    ├── confirmations.ts  # waitForConfirmations()
    ├── retry.ts          # retryWithBackoff()
    └── logger.ts         # Structured logger
```

---

## Configuration

All configuration is driven by environment variables. When running via Docker Compose these are set automatically.

| Variable | Default | Description |
|----------|---------|-------------|
| `CHAIN_A_RPC_URL` | `http://127.0.0.1:8545` | JSON-RPC URL for Chain A |
| `CHAIN_B_RPC_URL` | `http://127.0.0.1:9545` | JSON-RPC URL for Chain B |
| `DEPLOYER_PRIVATE_KEY` | Anvil account #0 | Private key used by the relayer wallet |
| `CONFIRMATION_DEPTH` | `3` | Blocks to wait before acting on an event |
| `DB_PATH` | `./data/relayer.db` | Path to the SQLite database file |
| `ADDRESSES_PATH` | `./data/addresses.json` | Path to deployed contract addresses |

**Address fallback:** If `addresses.json` is not found, the relayer falls back to individual env vars:

| Variable | Contract |
|----------|---------|
| `VAULT_TOKEN_ADDR` | VaultToken (Chain A) |
| `BRIDGE_LOCK_ADDR` | BridgeLock (Chain A) |
| `GOVERNANCE_EMERGENCY_ADDR` | GovernanceEmergency (Chain A) |
| `WRAPPED_VAULT_TOKEN_ADDR` | WrappedVaultToken (Chain B) |
| `BRIDGE_MINT_ADDR` | BridgeMint (Chain B) |
| `GOVERNANCE_VOTING_ADDR` | GovernanceVoting (Chain B) |

---

## Viem Clients (`config.ts`)

The relayer uses [viem](https://viem.sh/) for all chain interaction.

| Export | Type | Purpose |
|--------|------|---------|
| `publicClientA` | `PublicClient` | Read-only access to Chain A (getLogs, getBlockNumber, etc.) |
| `publicClientB` | `PublicClient` | Read-only access to Chain B |
| `walletClientA` | `WalletClient` | Sign & send transactions to Chain A |
| `walletClientB` | `WalletClient` | Sign & send transactions to Chain B |
| `relayerAccount` | `Account` | The relayer's signing account (from `DEPLOYER_PRIVATE_KEY`) |

Both chains are defined with `defineChain()` using the chain IDs read from `addresses.json`.

---

## Listeners

Both listeners run as infinite polling loops and never resolve, keeping the relayer alive.

### `chainAListener.ts`

Polls `BridgeLock` for `Locked` events.  
On each event, calls `handleLocked(user, amount, nonce, destinationChainId, txHash, blockNumber)`.

### `chainBListener.ts`

Polls `BridgeMint` for `Burned` events → calls `handleBurned(...)`.  
Polls `GovernanceVoting` for `ProposalPassed` events → calls `handleProposal(...)`.

Both use viem's `watchContractEvent` / `getLogs` with a stored `fromBlock` cursor to avoid re-processing old events on restart.

---

## Handlers

### `handleLocked`

**Trigger:** `Locked(user, amount, nonce, destinationChainId)` on Chain A  
**Action:** Calls `BridgeMint.mintWrapped(user, amount, nonce, sourceChainId)` on Chain B

```
1. Validate destinationChainId === config.chainB.chainId
2. checkIfProcessed(nonce, chainA.chainId, 'Locked')  → skip if true
3. waitForConfirmations(publicClientA, blockNumber, depth)
4. retryWithBackoff → walletClientB.writeContract(mintWrapped)
5. markAsProcessed(nonce, chainA.chainId, 'Locked', txHash)
```

### `handleBurned`

**Trigger:** `Burned(user, amount, nonce, destinationChainId)` on Chain B  
**Action:** Calls `BridgeLock.unlock(user, amount, nonce, sourceChainId)` on Chain A

```
1. Validate destinationChainId === config.chainA.chainId
2. checkIfProcessed(nonce, chainB.chainId, 'Burned')  → skip if true
3. waitForConfirmations(publicClientB, blockNumber, depth)
4. retryWithBackoff → walletClientA.writeContract(unlock)
5. markAsProcessed(nonce, chainB.chainId, 'Burned', txHash)
```

### `handleProposal`

**Trigger:** `ProposalPassed(proposalId, action)` on Chain B  
**Action:** Calls `GovernanceEmergency.executeAction(proposalId, sourceChainId, action)` on Chain A

```
1. checkIfProposalProcessed(proposalId, chainB.chainId)  → skip if true
2. Verify GovernanceEmergency address is configured
3. waitForConfirmations(publicClientB, blockNumber, depth)
4. retryWithBackoff → walletClientA.writeContract(executeAction)
5. markProposalAsProcessed(proposalId, chainB.chainId, txHash)
```

---

## SQLite Database (`db/sqlite.ts`)

Opened in **WAL mode** for better read concurrency. Three tables:

### `processed_events`

Prevents replaying the same `Locked` or `Burned` event.

| Column | Type | Description |
|--------|------|-------------|
| `chain_id` | INTEGER | Source chain ID |
| `nonce` | TEXT | Event nonce (stored as text for uint256 safety) |
| `event_type` | TEXT | `'Locked'` or `'Burned'` |
| `tx_hash` | TEXT | Resulting relay transaction hash |
| `processed_at` | DATETIME | Timestamp |

Unique constraint: `(chain_id, nonce, event_type)` — `INSERT OR IGNORE` is used for safe concurrent writes.

### `processed_proposals`

Prevents re-executing the same governance proposal.

| Column | Type | Description |
|--------|------|-------------|
| `chain_id` | INTEGER | Source chain ID (Chain B) |
| `proposal_id` | TEXT | Proposal ID (uint256 as text) |
| `tx_hash` | TEXT | Resulting relay transaction hash |

### `latest_blocks`

Tracks the last processed block per chain to resume from the correct position after a restart, avoiding re-processing old events.

| Column | Type |
|--------|------|
| `chain_id` | INTEGER (PK) |
| `block_number` | INTEGER |

---

## Utilities

### `waitForConfirmations`

```typescript
async function waitForConfirmations(
    client: PublicClient,
    blockNumber: bigint,
    requiredConfirmations: number
): Promise<void>
```

Polls `getBlockNumber()` every **2 seconds** until `currentBlock - blockNumber >= requiredConfirmations`. Uses the same viem `PublicClient` as the listener to reuse the existing HTTP transport.

### `retryWithBackoff`

```typescript
async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 5,
    initialDelay: number = 1000
): Promise<T>
```

Retries `fn` up to `maxRetries` times with **exponential backoff**: delay doubles on each failure (`1s → 2s → 4s → 8s → 16s`). Throws the last error if all attempts fail.

---

## Build & Runtime

The relayer is compiled from TypeScript at Docker image build time (`npm run build` → `dist/`), then started with `npm start` (`node dist/index.js`).

```bash
# Build the image and start everything
docker-compose up --build

# View relayer logs only
docker-compose logs -f relayer

# Restart just the relayer
docker-compose restart relayer
```
