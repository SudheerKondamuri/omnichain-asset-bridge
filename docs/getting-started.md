# Getting Started

This guide walks you through running the Omnichain Asset Bridge locally from scratch and performing a complete bridge round-trip.

---

## Prerequisites

| Tool | Minimum version | Purpose |
|------|----------------|---------|
| Docker | 24+ | Runs all services |
| Docker Compose | v2 (plugin) | Orchestrates containers |
| Node.js | 20+ | Local Hardhat tooling & tests |
| npm | 9+ | Package management |

---

## 1. Clone & Install

```bash
git clone https://github.com/SudheerKondamuri/omnichain-asset-bridge.git
cd omnichain-asset-bridge
npm install
```

> The root `node_modules` is used by the `deployer` container via bind mount. Run `npm install` on the host before starting Docker.

---

## 2. Environment Setup

The project ships with sensible defaults (Anvil's well-known test keys), so no `.env` file is required for local development.

If you want to override any setting, create a `.env` file at the project root:

```bash
# .env (optional for local dev — all values below are the defaults)
DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
CONFIRMATION_DEPTH=3
```

---

## 3. Compile Contracts

```bash
npx hardhat compile
```

This writes ABI + bytecode artifacts to `artifacts/`. The deployer container reads these at runtime.

---

## 4. Start the Full Stack

```bash
docker-compose up --build
```

Docker Compose starts four containers in order:

| Container | Image | Role |
|-----------|-------|------|
| `chain-a` | `ghcr.io/foundry-rs/foundry` | Anvil node — Chain ID 1111, port 8545 |
| `chain-b` | `ghcr.io/foundry-rs/foundry` | Anvil node — Chain ID 2222, port 9545 |
| `deployer` | `node:20-alpine` | Deploys all 6 contracts, writes `addresses.json`, exits |
| `relayer` | Built from `relayer/Dockerfile` | Listens for events and relays them indefinitely |

The relayer only starts **after** the deployer exits successfully (`condition: service_completed_successfully`).

Watch the logs to confirm everything is healthy:

```
deployer-1  | [Chain A] VaultToken deployed:  0x5FbDB2315678afecb367f032d93F642f64180aa3
deployer-1  | [Chain A] BridgeLock deployed:  0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
deployer-1  | [Chain A] GovernanceEmergency: 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
deployer-1  | [Chain B] WrappedVaultToken:  0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9
deployer-1  | [Chain B] BridgeMint deployed: 0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9
deployer-1  | [Chain B] GovernanceVoting:   0x5FC8d32690cc91D4c39d9d3abcBD16989F875707
deployer-1  | Addresses written to: /data/addresses.json
...
relayer-1   | Starting Relayer Service…
relayer-1   | Loaded deployed addresses from /usr/src/app/data/addresses.json
relayer-1   | Database initialized
```

To run in the background:

```bash
docker-compose up -d --build
docker-compose logs -f relayer   # tail relayer logs
```

---

## 5. Compile & Run Tests

With the stack running (or without it — Hardhat uses its own in-process node for tests):

```bash
npx hardhat test
```

To run tests against the live local nodes:

```bash
npx hardhat test --network chainA   # for Chain A contracts
npx hardhat test --network chainB   # for Chain B contracts
```

---

## 6. Manual Bridge Walkthrough

The following example uses `cast` (from Foundry) with the default Anvil private key. Substitute your own contract addresses from the deployer output.

### Variables (replace with your deployed addresses)

```bash
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
DEPLOYER=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

VAULT_TOKEN=<VaultToken address>
BRIDGE_LOCK=<BridgeLock address>
WRAPPED_VT=<WrappedVaultToken address>
BRIDGE_MINT=<BridgeMint address>
GOV_VOTING=<GovernanceVoting address>
```

### Lock VTK on Chain A → Receive wVTK on Chain B

```bash
# 1. Approve BridgeLock to spend 100 VTK
cast send $VAULT_TOKEN \
  "approve(address,uint256)" $BRIDGE_LOCK 100000000000000000000 \
  --private-key $PRIVATE_KEY --rpc-url http://127.0.0.1:8545

# 2. Lock 100 VTK, bridging to Chain B (chainId 2222)
cast send $BRIDGE_LOCK \
  "lock(uint256,uint256)" 100000000000000000000 2222 \
  --private-key $PRIVATE_KEY --rpc-url http://127.0.0.1:8545

# 3. Wait a few seconds for the relayer to relay (3 block confirmations)

# 4. Check wVTK balance on Chain B
cast call $WRAPPED_VT \
  "balanceOf(address)" $DEPLOYER \
  --rpc-url http://127.0.0.1:9545
```

### Burn wVTK on Chain B → Receive VTK back on Chain A

```bash
# 1. Burn 50 wVTK, bridging back to Chain A (chainId 1111)
cast send $BRIDGE_MINT \
  "burnWrapped(uint256,uint256)" 50000000000000000000 1111 \
  --private-key $PRIVATE_KEY --rpc-url http://127.0.0.1:9545

# 2. Wait for the relayer to relay

# 3. Check VTK balance on Chain A
cast call $VAULT_TOKEN \
  "balanceOf(address)" $DEPLOYER \
  --rpc-url http://127.0.0.1:8545
```

### Governance: Vote to Pause the Bridge

```bash
# 1. Self-delegate wVTK voting power on Chain B
cast send $WRAPPED_VT \
  "delegate(address)" $DEPLOYER \
  --private-key $PRIVATE_KEY --rpc-url http://127.0.0.1:9545

# 2. Create a PAUSE proposal (Action.PAUSE = 0)
cast send $GOV_VOTING \
  "createProposal(string,uint8)" "Emergency pause" 0 \
  --private-key $PRIVATE_KEY --rpc-url http://127.0.0.1:9545

# 3. Vote on proposal ID 0
cast send $GOV_VOTING \
  "vote(uint256)" 0 \
  --private-key $PRIVATE_KEY --rpc-url http://127.0.0.1:9545

# 4. Once quorum is met (1000 wVTK), ProposalPassed is emitted
#    The relayer calls executeAction() on GovernanceEmergency (Chain A)
#    BridgeLock is now paused on Chain A.
```

---

## 7. Stopping & Cleaning Up

```bash
# Stop all containers
docker-compose down

# Stop and remove volumes (resets all chain state and DB)
docker-compose down -v
```
