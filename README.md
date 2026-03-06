# Omnichain Asset Bridge

A local two-chain asset bridge with a TypeScript relayer and cross-chain governance. Demonstrates production-quality bridge architecture, relayer reliability patterns, and smart contract security.

```
[User] ──lock──► BridgeLock (Chain A) ──event──► Relayer ──mintWrapped──► BridgeMint (Chain B) ──► wVTK
[User] ◄─unlock─ BridgeLock (Chain A) ◄──tx───── Relayer ◄──event──────── BridgeMint (Chain B) ◄─ burn
```

## Features

- **Chain A (Settlement)** — `VaultToken` (VTK) + `BridgeLock` + `GovernanceEmergency`
- **Chain B (Execution)** — `WrappedVaultToken` (wVTK, ERC20Votes) + `BridgeMint` + `GovernanceVoting`
- **Relayer** — TypeScript/viem service with confirmation waiting, exponential-backoff retry, and SQLite idempotency
- **Cross-Chain Governance** — wVTK holders on Chain B vote to pause/unpause the bridge on Chain A
- **Replay Protection** — on-chain nonce mappings + off-chain SQLite deduplication
- **Snapshot Voting** — `ERC20Votes` snapshot at proposal creation prevents buy→vote→transfer exploits

## Quick Start

```bash
# 1. Install host dependencies (used by the deployer container via bind mount)
npm install

# 2. Compile contracts
npx hardhat compile

# 3. Start everything (chains + deployer + relayer)
docker-compose up --build
```

The deployer automatically deploys all 6 contracts and writes `addresses.json` to a shared volume. The relayer starts once deployment succeeds.

## Commands

| Command                          | Description                            |
| -------------------------------- | -------------------------------------- |
| `npx hardhat compile`            | Compile all Solidity contracts         |
| `npx hardhat test`               | Run the Hardhat test suite             |
| `docker-compose up --build`      | Build and start all services           |
| `docker-compose up -d --build`   | Start all services in the background   |
| `docker-compose logs -f relayer` | Tail relayer logs                      |
| `docker-compose down`            | Stop all containers                    |
| `docker-compose down -v`         | Stop and wipe all volumes (full reset) |

## Stack

| Layer              | Technology                           |
| ------------------ | ------------------------------------ |
| Smart Contracts    | Solidity 0.8.20, OpenZeppelin v5     |
| Contract Toolchain | Hardhat, ethers.js v6                |
| Relayer            | Node.js 20, TypeScript, viem         |
| Persistence        | better-sqlite3 (WAL mode)            |
| Local Chains       | Foundry Anvil (Chain ID 1111 & 2222) |
| Orchestration      | Docker Compose                       |

## Documentation

| Doc                                                | Description                                        |
| -------------------------------------------------- | -------------------------------------------------- |
| [docs/overview.md](docs/overview.md)               | Project summary, design decisions, repo layout     |
| [docs/architecture.md](docs/architecture.md)       | Message flows, system diagram, startup sequence    |
| [docs/contracts.md](docs/contracts.md)             | Full contract reference — functions, events, roles |
| [docs/relayer.md](docs/relayer.md)                 | Relayer internals, config, handlers, SQLite schema |
| [docs/getting-started.md](docs/getting-started.md) | Step-by-step setup and `cast` walkthrough          |
| [docs/security.md](docs/security.md)               | Threat model, replay protection, known limitations |
