// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract BridgeLock is Pausable, AccessControl {
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    IERC20 public immutable token;
    uint256 public nextNonce; 

    mapping(uint256 => bool) public processedNonces;

    event Locked(address indexed user, uint256 amount, uint256 nonce);
    event Unlocked(address indexed user, uint256 amount, uint256 nonce);

    constructor(address _admin, address _relayer, address _token) {
        token = IERC20(_token);
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(RELAYER_ROLE, _relayer);
    }

    function lock(uint256 amount) external whenNotPaused {
        require(amount > 0, "Amount must be > 0");
        uint256 currentNonce = nextNonce++;
        
        // Requirement: User must have called token.approve() first
        require(token.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        
        emit Locked(msg.sender, amount, currentNonce);
    }

    function unlock(address user, uint256 amount, uint256 nonceFromChainB) 
        external 
        onlyRole(RELAYER_ROLE) 
        whenNotPaused 
    {
        require(!processedNonces[nonceFromChainB], "Nonce already processed");
        
        processedNonces[nonceFromChainB] = true;
        
        require(token.transfer(user, amount), "Transfer failed");
        emit Unlocked(user, amount, nonceFromChainB);
    }

    // Required for the Governance Recovery requirement
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}