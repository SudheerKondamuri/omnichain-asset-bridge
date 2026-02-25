# Local Omnichain Asset Bridge

A local two-chain asset bridge with a Node.js relayer and cross-chain governance. This project demonstrates bridge architecture, relayer reliability, and smart contract security patterns.

## Features
- **Settlement Chain (Chain A)**: Contains the original `VaultToken` and a `BridgeLock` contract.
- **Execution Chain (Chain B)**: Contains a wrapped representative `WrappedVaultToken` and a `BridgeMint` contract.
- **Relayer Service**: A Node.js service that listens to events and relays messages between the two chains, utilizing SQLite for state persistence to prevent replay attacks.
- **Cross-Chain Governance**: Governance on Chain B can vote to trigger an emergency pause on Chain A.

## Running the Project
1. Copy `.env.example` to `.env`.
2. Run `docker-compose up -d --build` to start both local nodes and the relayer in the background.
3. Install dependencies: `npm install`
4. Deploy contracts to the local networks (Wait for network health checks to pass).

## Commands
- **Test**: `npx hardhat test`
- **Compile**: `npx hardhat compile`
