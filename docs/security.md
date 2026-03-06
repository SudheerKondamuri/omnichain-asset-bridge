# Security Model

This document describes the security patterns used in the Omnichain Asset Bridge, potential attack vectors, and their mitigations.

---

## Threat Model Summary

| Threat | Mitigation |
|--------|-----------|
| Replay attack (same event processed twice) | On-chain `processedSourceNonces` mapping + off-chain SQLite idempotency |
| Double-vote in governance | `ERC20Votes` snapshot at proposal creation (`snapshotBlock = block.number - 1`) |
| Unauthorized relayer | `RELAYER_ROLE` via OpenZeppelin `AccessControl` on every sensitive function |
| RPC transient failures causing stuck events | `retryWithBackoff` — 5 attempts with exponential backoff |
| Chain reorganisation | `CONFIRMATION_DEPTH` (default 3 blocks) before acting on any event |
| Governance replay (same proposal executed twice) | `processedProposals` mapping in `GovernanceEmergency` + SQLite `processed_proposals` table |
| Bridge used while paused | `whenNotPaused` modifier on `lock`, `unlock`, `mintWrapped`, `burnWrapped` |
| Bridging to same chain | `require(destinationChainId != currentChainId)` in both `lock` and `burnWrapped` |

---

## Replay Protection (Double-Spend Prevention)

### On-chain layer

Both `BridgeLock` and `BridgeMint` maintain a mapping:

```solidity
mapping(uint256 => mapping(uint256 => bool)) public processedSourceNonces;
// processedSourceNonces[sourceChainId][nonce] = true
```

When the relayer submits `unlock()` or `mintWrapped()`, the contract:
1. Checks `processedSourceNonces[sourceChainId][nonce]` — reverts if `true`.
2. Sets it to `true` before transferring tokens.

This is the last line of defence: even if the relayer sends the same transaction twice, the second call will revert on-chain.

### Off-chain layer (SQLite)

The relayer maintains a `processed_events` table keyed on `(chain_id, nonce, event_type)`. Before submitting any relay transaction the handler calls `checkIfProcessed()`. If the nonce is already recorded, the handler skips it silently.

This prevents redundant on-chain transactions (and their gas costs) caused by relayer restarts, listener re-scans, or duplicated events.

**Both layers together** create a defence-in-depth: the off-chain check avoids unnecessary transactions; the on-chain check is the absolute guard.

---

## Access Control

Every privileged function is protected by OpenZeppelin `AccessControl`:

```
BridgeLock.unlock()              → requires RELAYER_ROLE
BridgeLock.pause() / unpause()   → requires PAUSER_ROLE
BridgeMint.mintWrapped()         → requires RELAYER_ROLE
BridgeMint.pause() / unpause()   → requires PAUSER_ROLE
GovernanceEmergency.executeAction() → requires RELAYER_ROLE
WrappedVaultToken.mint() / burn() → requires MINTER_ROLE
```

`DEFAULT_ADMIN_ROLE` is held only by the deployer. In a production environment, the admin role should be transferred to a multisig or governance contract after setup.

---

## Snapshot-Based Governance (Anti-Double-Vote)

`GovernanceVoting` uses `ERC20Votes.getPastVotes()` rather than `balanceOf()`:

```solidity
uint256 weight = token.getPastVotes(msg.sender, p.snapshotBlock);
```

`snapshotBlock` is set to `block.number - 1` at proposal creation. This means:

- Tokens purchased **after** proposal creation have zero weight in that vote.
- The classic **buy → vote → transfer → vote again** exploit is impossible: the second address has no historical voting power at `snapshotBlock`.

> **Delegation requirement:** `ERC20Votes` requires holders to call `delegate()` before voting power is tracked. Undelegated balances contribute zero votes. This is by design — it forces users to explicitly opt in.

---

## Confirmation Depth

The relayer waits for `CONFIRMATION_DEPTH` (default: 3) block confirmations before submitting a relay transaction. This mitigates:

- **Chain reorganisations** — a shallow reorg that removes the source event is caught before tokens are minted/unlocked on the destination.
- **Finality assumptions** — on Anvil (local) blocks are instant, but the same code works safely on networks with real block times.

In production, the confirmation depth should be tuned to the source chain's finality characteristics (e.g., 12–64 blocks on Ethereum mainnet).

---

## Retry & Fault Tolerance

```
retryWithBackoff(fn, maxRetries=5, initialDelay=1000ms)
  attempt 1: immediate
  attempt 2: wait 1s
  attempt 3: wait 2s
  attempt 4: wait 4s
  attempt 5: wait 8s
```

If all 5 attempts fail, the error is thrown and logged. The event remains **unprocessed in SQLite**, meaning the next relayer restart will re-pick it from the listener and retry the full pipeline.

---

## Pause Mechanism

The bridge can be paused on either chain independently:

- **Chain A** (`BridgeLock`): Blocks `lock()` and `unlock()`. Triggered by `GovernanceEmergency.executeAction(0)`.
- **Chain B** (`BridgeMint`): Blocks `mintWrapped()` and `burnWrapped()`. Can be triggered independently via the `PAUSER_ROLE`.

Only addresses with `PAUSER_ROLE` can pause/unpause. `GovernanceEmergency` on Chain A holds `PAUSER_ROLE` on `BridgeLock`, allowing the relayer to relay a cross-chain governance decision into a real pause.

---

## Known Limitations (Local Dev Scope)

| Limitation | Notes |
|------------|-------|
| Single relayer, no redundancy | A second relayer instance would race; SQLite idempotency would prevent double-execution but coordination is needed |
| Relayer key = deployer key | In production, use a dedicated, lower-privileged relayer wallet |
| No light-client / ZK proof | The relayer is a trusted off-chain actor; trust assumptions exist |
| No token supply cap enforcement | The total bridged supply is bounded by the tokens locked on Chain A, but this is not enforced by a supply cap on `WrappedVaultToken` |
| `VOTING_DURATION = 1 hour` | Fine for demos; adjust to days/weeks for production |
| `QUORUM = 1000 wVTK` | Easily reachable with the minted supply; set a higher fraction of total supply for production |
