// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./interfaces/IBridgeLock.sol";


contract GovernanceEmergency is AccessControl {
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");
    
    IBridgeLock public immutable bridge;
    
    // Track processed proposals to prevent the Relayer from 
    // re-pausing/unpausing with the same vote
    mapping(uint256 => bool) public processedProposals;

    event EmergencyActionExecuted(uint256 indexed proposalId, string action);

    constructor(address _bridge, address _relayer) {
        bridge = IBridgeLock(_bridge);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(RELAYER_ROLE, _relayer);
    }

    /**
     * @dev Called by the Relayer when a "Pause" proposal passes on Chain B.
     * @param proposalId The ID from GovernanceVoting.sol on Chain B.
     */
    function executePause(uint256 proposalId) external onlyRole(RELAYER_ROLE) {
        require(!processedProposals[proposalId], "Proposal already executed");
        processedProposals[proposalId] = true;

        bridge.pause();
        
        emit EmergencyActionExecuted(proposalId, "PAUSE");
    }

    /**
     * @dev Called by the Relayer when an "Unpause" proposal passes on Chain B.
     */
    function executeUnpause(uint256 proposalId) external onlyRole(RELAYER_ROLE) {
        require(!processedProposals[proposalId], "Proposal already executed");
        processedProposals[proposalId] = true;

        bridge.unpause();
        
        emit EmergencyActionExecuted(proposalId, "UNPAUSE");
    }
}