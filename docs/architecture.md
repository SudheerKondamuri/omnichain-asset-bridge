# Architecture

This document describes the detailed message flows, component interactions, and startup sequence of the Omnichain Asset Bridge.

---

## System Diagram

```
 ┌──────────────────────────────────────────────────────────────────────┐
 │                           Docker Network                             │
 │                                                                      │
 │  ┌─────────────────────┐          ┌─────────────────────┐           │
 │  │  chain-a (Anvil)    │          │  chain-b (Anvil)    │           │
 │  │  Chain ID: 1111     │          │  Chain ID: 2222     │           │
 │  │  Port: 8545         │          │  Port: 9545         │           │
 │  │                     │          │                     │           │
 │  │  VaultToken         │          │  WrappedVaultToken  │           │
 │  │  BridgeLock         │          │  BridgeMint         │           │
 │  │  GovernanceEmergency│          │  GovernanceVoting   │           │
 │  └──────────┬──────────┘          └──────────┬──────────┘           │
 │             │  events & txns                 │  events & txns       │
 │             └──────────────┬─────────────────┘                      │
 │                            │                                         │
 │                   ┌────────▼────────┐                                │
 │                   │     relayer     │                                │
 │                   │  (Node.js/TS)   │                                │
 │                   │                 │                                │
 │                   │  ChainAListener │◄── Locked events               │
 │                   │  ChainBListener │◄── Burned / ProposalPassed     │
 │                   │  handleLocked   │──► mintWrapped (Chain B)       │
 │                   │  handleBurned   │──► unlock (Chain A)            │
 │                   │  handleProposal │──► executeAction (Chain A)     │
 │                   │                 │                                │
 │                   │  SQLite DB ─────┤ processed_events               │
 │                   │  (WAL mode)     │ processed_proposals            │
 │                   └─────────────────┘                                │
 │                                                                      │
 │  ┌─────────────────────┐                                             │
 │  │    deployer         │  (one-shot container)                       │
 │  │  scripts/deploy.js  │──► writes /data/addresses.json             │
 │  └─────────────────────┘         │                                  │
 │                                  │  shared Docker volume            │
 │                            relayer reads ◄───────────────────────── │
 └──────────────────────────────────────────────────────────────────────┘
```

---

## Flow 1: Lock → Mint (Chain A → Chain B)

```
User                BridgeLock (A)         Relayer              BridgeMint (B)
 │                        │                    │                      │
 │ approve(bridgeLock, n) │                    │                      │
 │───────────────────────►│                    │                      │
 │                        │                    │                      │
 │ lock(amount, chainId=2222)                  │                      │
 │───────────────────────►│                    │                      │
 │                        │ emit Locked(user,  │                      │
 │                        │  amount, nonce, 2222)                     │
 │                        │───────────────────►│                      │
 │                        │                    │ wait 3 confirmations │
 │                        │                    │ check SQLite nonce   │
 │                        │                    │ mintWrapped(user,    │
 │                        │                    │  amount, nonce, 1111)│
 │                        │                    │─────────────────────►│
 │                        │                    │                      │ mint wVTK to user
 │                        │                    │◄─────────────────────│
 │                        │                    │ markAsProcessed()    │
```

**Contracts involved:** `BridgeLock.lock()` → `Locked` event → `BridgeMint.mintWrapped()`

---

## Flow 2: Burn → Unlock (Chain B → Chain A)

```
User               BridgeMint (B)          Relayer              BridgeLock (A)
 │                       │                     │                      │
 │ burnWrapped(amount, 1111)                   │                      │
 │──────────────────────►│                     │                      │
 │                       │ emit Burned(user,   │                      │
 │                       │  amount, nonce, 1111)                      │
 │                       │────────────────────►│                      │
 │                       │                     │ wait 3 confirmations │
 │                       │                     │ check SQLite nonce   │
 │                       │                     │ unlock(user, amount, │
 │                       │                     │  nonce, 2222)        │
 │                       │                     │─────────────────────►│
 │                       │                     │                      │ transfer VTK to user
 │                       │                     │◄─────────────────────│
 │                       │                     │ markAsProcessed()    │
```

**Contracts involved:** `BridgeMint.burnWrapped()` → `Burned` event → `BridgeLock.unlock()`

---

## Flow 3: Cross-Chain Governance (Chain B → Chain A)

```
Proposer          GovernanceVoting (B)      Relayer         GovernanceEmergency (A)   BridgeLock (A)
    │                     │                     │                     │                     │
    │ createProposal(     │                     │                     │                     │
    │  "pause", PAUSE)    │                     │                     │                     │
    │────────────────────►│ snapshotBlock=N-1   │                     │                     │
    │                     │                     │                     │                     │
    │ delegate(self)      │                     │                     │                     │ (wVTK holders)
    │ vote(proposalId)    │                     │                     │                     │
    │────────────────────►│                     │                     │                     │
    │                     │ votesFor >= QUORUM  │                     │                     │
    │                     │ emit ProposalPassed │                     │                     │
    │                     │  (id, action=0)     │                     │                     │
    │                     │────────────────────►│                     │                     │
    │                     │                     │ wait confirmations  │                     │
    │                     │                     │ executeAction(id,   │                     │
    │                     │                     │  2222, action=0)    │                     │
    │                     │                     │────────────────────►│                     │
    │                     │                     │                     │ bridge.pause()      │
    │                     │                     │                     │────────────────────►│
    │                     │                     │                     │                     │ paused ✓
```

**Action values:** `0` = PAUSE, `1` = UNPAUSE

---

## Startup Sequence (Docker Compose)

```
t=0s   chain-a starts (Anvil, port 8545)
t=0s   chain-b starts (Anvil, port 9545)
t=10s  deployer starts (waits 10s for nodes to be ready)
       └─► deploys all 6 contracts
       └─► writes /data/addresses.json
       └─► exits with code 0
t=~15s relayer starts (depends_on: deployer completed_successfully)
       └─► reads addresses.json
       └─► initialises SQLite
       └─► starts ChainAListener + ChainBListener (infinite poll loops)
```

---

## Relayer Event Processing Pipeline

Every event goes through the same 4-step pipeline:

```
1. Event detected by listener (viem watchContractEvent / getLogs)
          │
          ▼
2. Idempotency check  ──► already processed? → skip
   (SQLite lookup)
          │
          ▼
3. waitForConfirmations(depth=3)
   polls getBlockNumber() every 2s
          │
          ▼
4. retryWithBackoff(fn, maxRetries=5, initialDelay=1000ms)
   writes tx to destination chain
          │
          ▼
5. markAsProcessed() — persists nonce/proposalId in SQLite
```

---

## Data Flow: addresses.json

The deployer writes this file to a shared Docker volume (`relayer_data`). The relayer reads it on startup:

```json
{
  "chainA": {
    "chainId": 1111,
    "rpcUrl": "http://chain-a:8545",
    "vaultToken": "0x...",
    "bridgeLock": "0x...",
    "governanceEmergency": "0x..."
  },
  "chainB": {
    "chainId": 2222,
    "rpcUrl": "http://chain-b:9545",
    "wrappedVaultToken": "0x...",
    "bridgeMint": "0x...",
    "governanceVoting": "0x..."
  }
}
```

If the file is absent, `config.ts` falls back to individual environment variables (`VAULT_TOKEN_ADDR`, `BRIDGE_LOCK_ADDR`, etc.).
