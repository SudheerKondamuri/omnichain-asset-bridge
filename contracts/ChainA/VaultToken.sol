// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract VaultToken is ERC20, Ownable {
    constructor(
        address initialOwner
    ) ERC20("Vault Token", "VTK") Ownable(initialOwner) {
        // Mint to initialOwner, not msg.sender — they may differ
        // (e.g. factory contracts or CREATE2 deployers)
        _mint(initialOwner, 1000000 * 10 ** decimals());
    }
}
