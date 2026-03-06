# Omnichain Asset Bridge — Project Overview

A local two-chain asset bridge with a TypeScript relayer service and cross-chain governance. The project demonstrates production-quality bridge architecture, relayer reliability patterns, and smart contract security.

---

## What It Does

Users can move **VaultToken (VTK)** between two independent EVM chains:

| Direction | Action | Result |
|-----------|--------|--------|
| Chain A → Chain B | Lock VTK on Chain A | Receive Wrapped VTK (wVTK) on Chain B |
| Chain B → Chain A | Burn wVTK on Chain B | Receive VTK back on Chain A |

A cross-chain governance system allows token holders on Chain B to vote to **pause or unpause** the bridge on Chain A, with the relayer executing the governance decision.

---

## High-Level Components

```
┌─────────────────────┐          ┌─────────────────────┐
│      Chain A        │          │      Chain B        │
│  (Settlement Chain) │          │  (Execution Chain)  │
│                     │          │                     │
│  VaultToken (VTK)   │          │  WrappedVaultToken  │
│  BridgeLock         │◄────────►│  BridgeMint         │
│  GovernanceEmergency│          │  GovernanceVoting   │
└─────────────────────┘          └─────────────────────┘
           ▲                                ▲
           │                                │
           └──────────── Relayer ───────────┘
                     (Node.js / TypeScript)
                     - Event listeners
                     - Confirmation waiting
                     - SQLite idempotency
                     - Retry with backoff
```

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Solidity 0.8.20, OpenZeppelin v5 |
| Contract Toolchain | Hardhat, ethers.js v6 |
| Relayer | Node.js 20, TypeScript, viem |
| Relayer Persistence | better-sqlite3 (WAL mode) |
| Local Chains | Foundry Anvil (Chain ID 1111 & 2222) |
| Orchestration | Docker Compose |

---

## Repository Layout

```
omnichain-asset-bridge/
├── contracts/
│   ├── ChainA/
│   │   ├── VaultToken.sol            # Native ERC-20 token
│   │   ├── BridgeLock.sol            # Locks tokens; emits Locked events
│   │   ├── GovernanceEmergency.sol   # Executes cross-chain pause proposals
│   │   └── interfaces/IBridgeLock.sol
│   └── ChainB/
│       ├── WrappedVaultToken.sol     # ERC20Votes wrapped token
│       ├── BridgeMint.sol            # Mints/burns wVTK; emits Minted/Burned
│       ├── GovernanceVoting.sol      # Snapshot-based voting
│       └── interfaces/IWrappedVaultToken.sol
├── relayer/
│   └── src/
│       ├── index.ts                  # Entry point
│       ├── config.ts                 # Env vars, viem clients, address loading
│       ├── listeners/                # Chain A & B event polling loops
│       ├── handlers/                 # handleLocked, handleBurned, handleProposal
│       ├── db/sqlite.ts              # Idempotency & state persistence
│       └── utils/                    # confirmations, retry, logger
├── scripts/
│   └── deploy.js                     # Deploys all contracts; writes addresses.json
├── tests/                            # Hardhat test suite
├── docker-compose.yml
└── hardhat.config.js
```

---

## Key Design Decisions

- **Nonce-based replay protection** — both on-chain (contract `processedSourceNonces` mapping) and off-chain (SQLite `processed_events` table) to prevent double-execution.
- **Confirmation depth** — the relayer waits for `CONFIRMATION_DEPTH` (default 3) blocks before acting, avoiding reorg-related issues.
- **Snapshot voting** — `WrappedVaultToken` extends `ERC20Votes`; governance proposals capture a `snapshotBlock` so token transfers after proposal creation cannot influence vote weight.
- **Exponential backoff retry** — all outbound transactions use `retryWithBackoff` (5 attempts, doubling delay) to handle transient RPC failures.
- **Shared volume handoff** — `deploy.js` writes `addresses.json` to a Docker volume that the relayer reads on startup, keeping configuration automatic.
