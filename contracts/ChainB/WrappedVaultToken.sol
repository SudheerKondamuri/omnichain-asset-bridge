// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @dev WrappedVaultToken extends ERC20Votes so that balances are snapshotted
 * on every transfer. GovernanceVoting reads past snapshots via getPastVotes(),
 * making the double-vote (buy → vote → transfer → vote again) exploit impossible.
 *
 * NOTE: Holders must call delegate(address) (or self-delegate via delegate(msg.sender))
 * before their votes count. Voting power is zero until delegation is set.
 */
contract WrappedVaultToken is ERC20Votes, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    // ERC20Votes inherits ERC20Permit which inherits EIP712.
    // Call ERC20 and EIP712 constructors directly — no need to list ERC20Permit
    // as a base since it is already in the ERC20Votes inheritance chain.
    constructor()
        ERC20("Wrapped Vault Token", "wVTK")
        EIP712("Wrapped Vault Token", "1")
    {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function mint(address to, uint256 amount) public onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) public onlyRole(MINTER_ROLE) {
        _burn(from, amount);
    }
}
