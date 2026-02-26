// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./interfaces/IBridgeLock.sol";



contract GovernanceEmergency is AccessControl {
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");
    IBridgeLock public immutable bridge;

    // sourceChainId => proposalId => executed
    mapping(uint256 => mapping(uint256 => bool)) public processedProposals;

    constructor(address _bridge, address _relayer) {
        bridge = IBridgeLock(_bridge);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(RELAYER_ROLE, _relayer);
    }

    function executeAction(uint256 proposalId, uint256 sourceChainId, uint8 action) 
        external 
        onlyRole(RELAYER_ROLE) 
    {
        require(!processedProposals[sourceChainId][proposalId], "Proposal already executed");
        processedProposals[sourceChainId][proposalId] = true;

        if (action == 0) {
            bridge.pause();
        } else if (action == 1) {
            bridge.unpause();
        } else {
            revert("Invalid action");
        }
    }
}