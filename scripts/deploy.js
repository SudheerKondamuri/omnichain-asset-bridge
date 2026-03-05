/**
 * deploy.js — Deploy all contracts to Chain A and Chain B.
 *
 * Uses raw ethers.js (available via Hardhat) so this script works both
 * inside `npx hardhat run` and as a standalone `node scripts/deploy.js`.
 *
 * Writes an addresses.json file that the relayer reads on startup.
 */

const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

// Anvil default account #0
const DEFAULT_PRIVATE_KEY =
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

// ── Load compiled Hardhat artifacts ────────────────────────────────
const VaultTokenArt     = require("../artifacts/contracts/ChainA/VaultToken.sol/VaultToken.json");
const BridgeLockArt     = require("../artifacts/contracts/ChainA/BridgeLock.sol/BridgeLock.json");
const GovEmergencyArt   = require("../artifacts/contracts/ChainA/GovernanceEmergency.sol/GovernanceEmergency.json");
const WrappedVTArt      = require("../artifacts/contracts/ChainB/WrappedVaultToken.sol/WrappedVaultToken.json");
const BridgeMintArt     = require("../artifacts/contracts/ChainB/BridgeMint.sol/BridgeMint.json");
const GovVotingArt      = require("../artifacts/contracts/ChainB/GovernanceVoting.sol/GovernanceVoting.json");

// ── Helpers ────────────────────────────────────────────────────────
async function deploy(deployer, artifact, args = []) {
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, deployer);
    const contract = await factory.deploy(...args);
    await contract.waitForDeployment();
    return contract;
}

// ── Chain A deployment ─────────────────────────────────────────────
async function deployChainA(rpcUrl, privateKey) {
    console.log(`\n[Chain A] Connecting to ${rpcUrl}…`);
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const deployer = new ethers.Wallet(privateKey, provider);
    console.log(`[Chain A] Deployer: ${deployer.address}`);

    // 1. VaultToken (mints 1 000 000 VTK to deployer)
    const vaultToken = await deploy(deployer, VaultTokenArt, [deployer.address]);
    const vaultTokenAddr = await vaultToken.getAddress();
    console.log(`[Chain A] VaultToken deployed:  ${vaultTokenAddr}`);

    // 2. BridgeLock — relayer = deployer for local dev
    const bridgeLock = await deploy(deployer, BridgeLockArt, [
        vaultTokenAddr,
        deployer.address, // relayer address
        1111,             // chainId
    ]);
    const bridgeLockAddr = await bridgeLock.getAddress();
    console.log(`[Chain A] BridgeLock deployed:  ${bridgeLockAddr}`);

    // 3. Grant PAUSER_ROLE on BridgeLock to the future GovernanceEmergency contract
    //    We deploy GovernanceEmergency first, then grant.
    const govEmergency = await deploy(deployer, GovEmergencyArt, [
        bridgeLockAddr,
        deployer.address, // relayer address
    ]);
    const govEmergencyAddr = await govEmergency.getAddress();
    console.log(`[Chain A] GovernanceEmergency: ${govEmergencyAddr}`);

    // Grant PAUSER_ROLE on BridgeLock → GovernanceEmergency so it can pause/unpause
    const PAUSER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PAUSER_ROLE"));
    let tx = await bridgeLock.grantRole(PAUSER_ROLE, govEmergencyAddr);
    await tx.wait();
    console.log(`[Chain A] Granted PAUSER_ROLE → GovernanceEmergency`);

    return {
        vaultToken: vaultTokenAddr,
        bridgeLock: bridgeLockAddr,
        governanceEmergency: govEmergencyAddr,
    };
}

// ── Chain B deployment ─────────────────────────────────────────────
async function deployChainB(rpcUrl, privateKey) {
    console.log(`\n[Chain B] Connecting to ${rpcUrl}…`);
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const deployer = new ethers.Wallet(privateKey, provider);
    console.log(`[Chain B] Deployer: ${deployer.address}`);

    // 1. WrappedVaultToken
    const wrappedVT = await deploy(deployer, WrappedVTArt);
    const wrappedVTAddr = await wrappedVT.getAddress();
    console.log(`[Chain B] WrappedVaultToken:  ${wrappedVTAddr}`);

    // 2. BridgeMint
    const bridgeMint = await deploy(deployer, BridgeMintArt, [
        wrappedVTAddr,
        deployer.address, // relayer address
        2222,             // chainId
    ]);
    const bridgeMintAddr = await bridgeMint.getAddress();
    console.log(`[Chain B] BridgeMint deployed: ${bridgeMintAddr}`);

    // 3. Grant MINTER_ROLE on WrappedVaultToken → BridgeMint
    const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
    let tx = await wrappedVT.grantRole(MINTER_ROLE, bridgeMintAddr);
    await tx.wait();
    console.log(`[Chain B] Granted MINTER_ROLE → BridgeMint`);

    // 4. GovernanceVoting
    const govVoting = await deploy(deployer, GovVotingArt, [wrappedVTAddr]);
    const govVotingAddr = await govVoting.getAddress();
    console.log(`[Chain B] GovernanceVoting:   ${govVotingAddr}`);

    return {
        wrappedVaultToken: wrappedVTAddr,
        bridgeMint: bridgeMintAddr,
        governanceVoting: govVotingAddr,
    };
}

// ── Main ───────────────────────────────────────────────────────────
async function main() {
    const chainARpc  = process.env.CHAIN_A_RPC_URL || "http://127.0.0.1:8545";
    const chainBRpc  = process.env.CHAIN_B_RPC_URL || "http://127.0.0.1:9545";
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY || DEFAULT_PRIVATE_KEY;

    console.log("=== Omnichain Asset Bridge — Deployment ===");

    // Deploy sequentially to avoid nonce conflicts with the same account
    const chainAAddrs = await deployChainA(chainARpc, privateKey);
    const chainBAddrs = await deployChainB(chainBRpc, privateKey);

    const addresses = {
        chainA: { chainId: 1111, rpcUrl: chainARpc, ...chainAAddrs },
        chainB: { chainId: 2222, rpcUrl: chainBRpc, ...chainBAddrs },
    };

    console.log("\n=== Deployment Summary ===");
    console.log(JSON.stringify(addresses, null, 2));

    // Write addresses.json for the relayer
    const outputPath =
        process.env.DATA_PATH ||
        path.join(__dirname, "../relayer/data/addresses.json");
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(addresses, null, 2));
    console.log(`\nAddresses written to: ${outputPath}`);
}

main().catch((err) => {
    console.error("Deployment failed:", err);
    process.exit(1);
});
