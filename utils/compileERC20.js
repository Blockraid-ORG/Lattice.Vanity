const path = require("path");
const fs = require("fs");
const solc = require("solc");

function findImports(importPath) {
  try {
    const fullPath = importPath.startsWith("@")
      ? path.resolve(__dirname, "../node_modules", importPath)
      : path.resolve(__dirname, importPath);
    return { contents: fs.readFileSync(fullPath, "utf8") };
  } catch (e) {
    return { error: "File not found: " + importPath };
  }
}

function compileERC20Token() {
  const source = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ERC20Token is ERC20, Pausable, Ownable {
    uint8 private _customDecimals;

    constructor(string memory name, string memory symbol, uint256 initialSupply, uint8 decimals_) 
    ERC20(name, symbol) Ownable(msg.sender) {
        _customDecimals = decimals_;
        _mint(msg.sender, initialSupply * 10 ** decimals_);
    }

    function decimals() public view virtual override returns (uint8) {
        return _customDecimals;
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function _update(address from, address to, uint256 value) internal override {
        if (paused()) {
            require(from == owner() || to == owner(), "ERC20Pausable: token transfer while paused");
        }
        super._update(from, to, value);
    }
}
`;
  const input = {
    language: "Solidity",
    sources: { "ERC20Token.sol": { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
  const contract = output.contracts["ERC20Token.sol"]["ERC20Token"];
  return { abi: contract.abi, bytecode: "0x" + contract.evm.bytecode.object };
}

module.exports = { compileERC20Token };
