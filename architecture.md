# Architecture Overview

1. User locks token on Chain A -> `BridgeLock` emits `Locked` event
2. Relayer listens and waits for 3 confirmations
3. Relayer validates and records nonce in local SQLite to prevent replay
4. Relayer submits `mintWrapped` transaction to `BridgeMint` on Chain B

```
[User] -> [BridgeLock (Chain A)] --(Event)--> [Relayer] --(Tx)--> [BridgeMint (Chain B)] -> [WrappedVaultToken]
```

Reverse flow:
1. User burns wrapped token on Chain B -> `BridgeMint` emits `Burned` event
2. Relayer listens and waits for 3 confirmations
3. Relayer validates and records nonce
4. Relayer submits `unlock` transaction to `BridgeLock` on Chain A

Governance flow:
1. `GovernanceVoting` on Chain B passes proposal -> emits `ProposalPassed` event
2. Relayer listens and waits
3. Relayer triggers `pauseBridge` on `GovernanceEmergency` on Chain A.
