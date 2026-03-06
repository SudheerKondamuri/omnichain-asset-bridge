# Smart Contract Reference

All contracts use Solidity `^0.8.20` and OpenZeppelin v5.

---

## Chain A Contracts

### VaultToken

**File:** `contracts/ChainA/VaultToken.sol`  
**Standard:** ERC-20 (`ERC20`, `Ownable`)

The native token on Chain A. Mints 1,000,000 VTK to the `initialOwner` at deployment.

| Item | Detail |
|------|--------|
| Name | Vault Token |
| Symbol | VTK |
| Decimals | 18 |
| Initial supply | 1,000,000 VTK |

**Constructor**

```solidity
constructor(address initialOwner)
```

| Parameter | Description |
|-----------|-------------|
| `initialOwner` | Receives the full initial supply and becomes the contract owner |

---

### BridgeLock

**File:** `contracts/ChainA/BridgeLock.sol`  
**Inherits:** `Pausable`, `AccessControl`, OpenZeppelin `SafeERC20`

Holds VTK in escrow when users bridge to Chain B, and releases it when the relayer proves a burn on Chain B.

#### Roles

| Role | Constant | Allowed to call |
|------|----------|-----------------|
| `DEFAULT_ADMIN_ROLE` | `0x00` | `grantRole`, `revokeRole` |
| `RELAYER_ROLE` | `keccak256("RELAYER_ROLE")` | `unlock()` |
| `PAUSER_ROLE` | `keccak256("PAUSER_ROLE")` | `pause()`, `unpause()` |

#### State

| Variable | Type | Description |
|----------|------|-------------|
| `token` | `IERC20` (immutable) | The VaultToken address |
| `currentChainId` | `uint256` (immutable) | Chain ID set at deploy (1111) |
| `nextNonce` | `uint256` | Auto-incrementing nonce for outbound locks |
| `processedSourceNonces` | `mapping(chainId => mapping(nonce => bool))` | Replay protection for incoming unlocks |

#### Functions

```solidity
function lock(uint256 amount, uint256 destinationChainId) external whenNotPaused
```
Transfers `amount` VTK from `msg.sender` to the contract, emits `Locked`. Requires prior `approve`.

```solidity
function unlock(address user, uint256 amount, uint256 nonce, uint256 sourceChainId)
    external onlyRole(RELAYER_ROLE) whenNotPaused
```
Releases `amount` VTK to `user`. Marks `processedSourceNonces[sourceChainId][nonce]` to prevent replay.

#### Events

```solidity
event Locked(address indexed user, uint256 amount, uint256 nonce, uint256 indexed destinationChainId);
event Unlocked(address indexed user, uint256 amount, uint256 nonce, uint256 indexed sourceChainId);
```

---

### GovernanceEmergency

**File:** `contracts/ChainA/GovernanceEmergency.sol`  
**Inherits:** `AccessControl`

Receives cross-chain governance decisions from the relayer and calls `pause()` or `unpause()` on `BridgeLock`.

#### Roles

| Role | Allowed to call |
|------|-----------------|
| `DEFAULT_ADMIN_ROLE` | Role management |
| `RELAYER_ROLE` | `executeAction()` |

#### State

| Variable | Type | Description |
|----------|------|-------------|
| `bridge` | `IBridgeLock` (immutable) | The BridgeLock contract |
| `processedProposals` | `mapping(sourceChainId => mapping(proposalId => bool))` | Prevents re-execution |

#### Functions

```solidity
function executeAction(uint256 proposalId, uint256 sourceChainId, uint8 action)
    external onlyRole(RELAYER_ROLE)
```

| `action` | Effect |
|----------|--------|
| `0` | Calls `bridge.pause()` |
| `1` | Calls `bridge.unpause()` |

---

## Chain B Contracts

### WrappedVaultToken

**File:** `contracts/ChainB/WrappedVaultToken.sol`  
**Inherits:** `ERC20Votes`, `AccessControl`  
**Also inherits (transitively):** `ERC20Permit`, `EIP712`

The representative token on Chain B. Extends `ERC20Votes` so balances are snapshotted on every transfer, enabling safe snapshot-based governance.

> **Important:** Token holders must call `delegate(address)` (or `delegate(msg.sender)` to self-delegate) before their balance counts as voting power. Undelegated balances have zero voting weight.

| Item | Detail |
|------|--------|
| Name | Wrapped Vault Token |
| Symbol | wVTK |
| Decimals | 18 (inherited) |

#### Roles

| Role | Constant | Allowed to call |
|------|----------|-----------------|
| `DEFAULT_ADMIN_ROLE` | `0x00` | Role management |
| `MINTER_ROLE` | `keccak256("MINTER_ROLE")` | `mint()`, `burn()` |

#### Functions

```solidity
function mint(address to, uint256 amount) public onlyRole(MINTER_ROLE)
function burn(address from, uint256 amount) public onlyRole(MINTER_ROLE)
```

`BridgeMint` is granted `MINTER_ROLE` at deploy time.

---

### BridgeMint

**File:** `contracts/ChainB/BridgeMint.sol`  
**Inherits:** `Pausable`, `AccessControl`

Mints wVTK when the relayer reports a lock on Chain A, and burns wVTK when users want to bridge back.

#### Roles

| Role | Allowed to call |
|------|-----------------|
| `DEFAULT_ADMIN_ROLE` | Role management |
| `RELAYER_ROLE` | `mintWrapped()` |
| `PAUSER_ROLE` | `pause()`, `unpause()` |

#### State

| Variable | Type | Description |
|----------|------|-------------|
| `wrappedToken` | `WrappedVaultToken` (immutable) | The wVTK contract |
| `currentChainId` | `uint256` (immutable) | Chain ID (2222) |
| `nextNonce` | `uint256` | Auto-incrementing nonce for outbound burns |
| `processedSourceNonces` | `mapping(chainId => mapping(nonce => bool))` | Replay protection for incoming mints |

#### Functions

```solidity
function mintWrapped(address user, uint256 amount, uint256 nonce, uint256 sourceChainId)
    external onlyRole(RELAYER_ROLE) whenNotPaused
```
Mints `amount` wVTK to `user`. Marks nonce to prevent replay.

```solidity
function burnWrapped(uint256 amount, uint256 destinationChainId)
    external whenNotPaused
```
Burns `amount` wVTK from `msg.sender`, emits `Burned` for the relayer to pick up.

#### Events

```solidity
event Minted(address indexed user, uint256 amount, uint256 nonce, uint256 sourceChainId);
event Burned(address indexed user, uint256 amount, uint256 nonce, uint256 destinationChainId);
```

---

### GovernanceVoting

**File:** `contracts/ChainB/GovernanceVoting.sol`

Snapshot-based on-chain voting. When a proposal reaches quorum, it emits `ProposalPassed` which the relayer forwards to `GovernanceEmergency` on Chain A.

#### Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `VOTING_DURATION` | `1 hours` | How long votes are accepted |
| `QUORUM` | `1000 * 10^18` | Minimum total votes needed to pass |

#### Proposal struct

```solidity
struct Proposal {
    string   description;
    Action   action;        // PAUSE (0) or UNPAUSE (1)
    uint256  votesFor;
    uint256  deadline;
    uint256  snapshotBlock; // block.number - 1 at creation
    bool     passed;
}
```

#### Functions

```solidity
function createProposal(string calldata description, Action action) external
```
Creates a proposal, records `snapshotBlock = block.number - 1`.

```solidity
function vote(uint256 proposalId) external
```
Uses `token.getPastVotes(msg.sender, snapshotBlock)` — voting power cannot be gamed by transferring tokens after proposal creation. Automatically emits `ProposalPassed` if quorum is reached.

#### Events

```solidity
event ProposalCreated(uint256 indexed id, string description, Action action, uint256 deadline);
event ProposalPassed(uint256 indexed id, uint8 action);
```

---

## Role Assignment Summary (at Deploy)

| Contract | Role | Granted to |
|----------|------|-----------|
| `BridgeLock` | `DEFAULT_ADMIN_ROLE` | deployer |
| `BridgeLock` | `RELAYER_ROLE` | deployer (relayer wallet in dev) |
| `BridgeLock` | `PAUSER_ROLE` | `GovernanceEmergency` |
| `GovernanceEmergency` | `DEFAULT_ADMIN_ROLE` | deployer |
| `GovernanceEmergency` | `RELAYER_ROLE` | deployer (relayer wallet) |
| `WrappedVaultToken` | `DEFAULT_ADMIN_ROLE` | deployer |
| `WrappedVaultToken` | `MINTER_ROLE` | `BridgeMint` |
| `BridgeMint` | `DEFAULT_ADMIN_ROLE` | deployer |
| `BridgeMint` | `RELAYER_ROLE` | deployer (relayer wallet) |
