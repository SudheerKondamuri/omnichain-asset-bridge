// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract BridgeLock is Pausable, AccessControl {
    using SafeERC20 for IERC20;

    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    IERC20 public immutable token;
    uint256 public nextNonce;

    uint256 public immutable currentChainId;

    mapping(uint256 => mapping(uint256 => bool)) public processedSourceNonces;

    event Locked(
        address indexed user,
        uint256 amount,
        uint256 nonce,
        uint256 indexed destinationChainId
    );

    event Unlocked(
        address indexed user,
        uint256 amount,
        uint256 nonce,
        uint256 indexed sourceChainId
    );

    constructor(address _token, address _relayer, uint256 _chainId) {
        token = IERC20(_token);
        currentChainId = _chainId;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(RELAYER_ROLE, _relayer);
    }

    function lock(
        uint256 amount,
        uint256 destinationChainId
    ) external whenNotPaused {
        require(amount > 0, "Amount must be > 0");
        require(
            destinationChainId != currentChainId,
            "Cannot bridge to same chain"
        );

        uint256 currentNonce = nextNonce++;

        token.safeTransferFrom(msg.sender, address(this), amount);

        emit Locked(msg.sender, amount, currentNonce, destinationChainId);
    }
 
    function unlock(
        address user,
        uint256 amount,
        uint256 nonce,
        uint256 sourceChainId
    ) external onlyRole(RELAYER_ROLE) whenNotPaused {
        require(sourceChainId != currentChainId, "Invalid source chain");
        require(
            !processedSourceNonces[sourceChainId][nonce],
            "Nonce already processed"
        );

        processedSourceNonces[sourceChainId][nonce] = true;

        token.safeTransfer(user, amount);
        emit Unlocked(user, amount, nonce, sourceChainId);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }
}
