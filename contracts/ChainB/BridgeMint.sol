// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./WrappedVaultToken.sol";

contract BridgeMint is Pausable, AccessControl {
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    WrappedVaultToken public immutable wrappedToken;
    uint256 public nextNonce;
    uint256 public immutable currentChainId;

    // mapping(sourceChainId => mapping(nonce => isProcessed))
    mapping(uint256 => mapping(uint256 => bool)) public processedSourceNonces;

    event Minted(address indexed user, uint256 amount, uint256 nonce, uint256 sourceChainId);
    event Burned(address indexed user, uint256 amount, uint256 nonce, uint256 destinationChainId);

    constructor(address _wrappedToken, address _relayer, uint256 _chainId) {
        wrappedToken = WrappedVaultToken(_wrappedToken);
        currentChainId = _chainId;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(RELAYER_ROLE, _relayer);
    }

    /**
     * @dev Called by the Relayer when tokens are locked on Chain A (or any other chain).
     */
    function mintWrapped(
        address user, 
        uint256 amount, 
        uint256 nonce, 
        uint256 sourceChainId
    ) external onlyRole(RELAYER_ROLE) whenNotPaused {
        require(sourceChainId != currentChainId, "Invalid source chain");
        require(!processedSourceNonces[sourceChainId][nonce], "Nonce already processed");

        processedSourceNonces[sourceChainId][nonce] = true;
        wrappedToken.mint(user, amount);

        emit Minted(user, amount, nonce, sourceChainId);
    }

    /**
     * @dev User burns wrapped tokens to move back to the native chain (e.g., Chain A).
     */
    function burnWrapped(uint256 amount, uint256 destinationChainId) external whenNotPaused {
        require(amount > 0, "Amount must be > 0");
        require(destinationChainId != currentChainId, "Cannot bridge to same chain");

        uint256 currentNonce = nextNonce++;
        
        // The Bridge contract must have BURNER_ROLE on the token
        wrappedToken.burn(msg.sender, amount);
        
        emit Burned(msg.sender, amount, currentNonce, destinationChainId);
    }

    // Governance Controls
    function pause() external onlyRole(PAUSER_ROLE) { _pause(); }
    function unpause() external onlyRole(PAUSER_ROLE) { _unpause(); }
}