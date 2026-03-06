// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/governance/utils/IVotes.sol";

contract GovernanceVoting {
    IVotes public immutable token;

    // 0 = PAUSE, 1 = UNPAUSE
    enum Action {
        PAUSE,
        UNPAUSE
    }

    struct Proposal {
        string description;
        Action action;
        uint256 votesFor;
        uint256 deadline;
        /// @dev Block number snapshot taken at proposal creation.
        /// Voting power is read from this block so tokens transferred
        /// after creation cannot be reused to vote multiple times.
        uint256 snapshotBlock;
        bool passed;
    }

    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    uint256 public proposalCount;

    // Adjust these for your specific demo needs
    uint256 public constant VOTING_DURATION = 1 hours;
    uint256 public constant QUORUM = 1000 * 10 ** 18;

    // Relayer listens for this. 'uint8 action' matches the executor's parameter.
    event ProposalPassed(uint256 indexed id, uint8 action);
    event ProposalCreated(
        uint256 indexed id,
        string description,
        Action action,
        uint256 deadline
    );

    constructor(address _token) {
        token = IVotes(_token);
    }

    /**
     * @dev Creates a proposal to either Pause or Unpause the bridge on Chain A.
     * Snapshots the current block so voting power is fixed at proposal creation time.
     */
    function createProposal(
        string calldata description,
        Action action
    ) external {
        uint256 id = proposalCount++;
        proposals[id] = Proposal({
            description: description,
            action: action,
            votesFor: 0,
            deadline: block.timestamp + VOTING_DURATION,
            snapshotBlock: block.number - 1,
            passed: false
        });

        emit ProposalCreated(id, description, action, proposals[id].deadline);
    }

    /**
     * @dev Snapshot-based voting. Uses getPastVotes() at the proposal's snapshotBlock
     * so tokens moved after proposal creation cannot be double-counted.
     * Voters must have self-delegated (token.delegate(msg.sender)) to have voting power.
     */
    function vote(uint256 proposalId) external {
        Proposal storage p = proposals[proposalId];

        require(block.timestamp < p.deadline, "Voting period ended");
        require(!hasVoted[proposalId][msg.sender], "Already voted");

        // Read balance from snapshot block — immune to buy-vote-transfer-vote exploit
        uint256 weight = token.getPastVotes(msg.sender, p.snapshotBlock);
        require(weight > 0, "No voting power");

        p.votesFor += weight;
        hasVoted[proposalId][msg.sender] = true;

        if (p.votesFor >= QUORUM && !p.passed) {
            p.passed = true;
            // Emit as uint8 so the Relayer can pass it directly to Chain A
            emit ProposalPassed(proposalId, uint8(p.action));
        }
    }
}
