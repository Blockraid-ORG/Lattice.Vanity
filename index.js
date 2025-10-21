const express = require("express");
const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");
const { Web3 } = require("web3");
const os = require("os");
const solc = require("solc");
const path = require("path");
const fs = require("fs");
const cors = require('cors');
const { ethers } = require("ethers");
const { verifySigner } = require("./middlewares/verifySigner");


// ========= Worker Thread untuk Vanity Search =========
if (!isMainThread) {
  const { factoryAddress, initCode, targetSuffix, startIndex, step, maxIndex, rpc } = workerData;
  const web3 = new Web3(rpc);

  function computeCreate2(factoryAddr, saltHex, initCodeHex) {
    const initCodeHash = web3.utils.keccak256(initCodeHex);
    const packed = web3.utils.soliditySha3(
      { t: "bytes1", v: "0xff" },
      { t: "address", v: factoryAddr },
      { t: "bytes32", v: saltHex },
      { t: "bytes32", v: initCodeHash }
    );
    return "0x" + packed.slice(-40);
  }

  for (let i = startIndex; i < maxIndex; i += step) {
    const saltHex = "0x" + i.toString(16).padStart(64, "0");
    const predicted = computeCreate2(factoryAddress, saltHex, initCode);
    if (predicted.toLowerCase().endsWith(targetSuffix)) {
      parentPort.postMessage({ found: true, salt: saltHex, address: predicted });
      process.exit(0);
    }
  }
  parentPort.postMessage({ found: false });
  process.exit(0);
}

// ========= Helper: Compile ERC20 =========
function findImports(importPath) {
  try {
    if (importPath.startsWith("@")) {
      const fullPath = path.resolve(__dirname, "node_modules", importPath);
      return { contents: fs.readFileSync(fullPath, "utf8") };
    } else {
      const fullPath = path.resolve(__dirname, importPath);
      return { contents: fs.readFileSync(fullPath, "utf8") };
    }
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

    constructor(
        string memory name,
        string memory symbol,
        uint256 initialSupply,
        uint8 decimals_
    ) ERC20(name, symbol) Ownable(msg.sender) {
        _customDecimals = decimals_;
        _mint(msg.sender, initialSupply * 10 ** decimals_);
    }

    function decimals() public view virtual override returns (uint8) {
        return _customDecimals;
    }

    // Pause and unpause restricted to owner
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // Custom pause logic: owner bypasses pause restriction
    function _update(
        address from,
        address to,
        uint256 value
    ) internal override {
        if (paused()) {
            // Allow owner to still transfer during pause
            require(
                from == owner() || to == owner(),
                "ERC20Pausable: token transfer while paused"
            );
        }
        super._update(from, to, value);
    }
}

`;
  const input = {
    language: "Solidity",
    sources: {
      "ERC20Token.sol": { content: source }
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
  // console.log(output);
  const contract = output.contracts["ERC20Token.sol"]["ERC20Token"];
  return { abi: contract.abi, bytecode: "0x" + contract.evm.bytecode.object };
}

// function computeCreate2(web3, factoryAddr, saltHex, initCodeHex) {
//   const initCodeHash = web3.utils.keccak256(initCodeHex);
//   const packed = web3.utils.soliditySha3(
//     { t: "bytes1", v: "0xff" },
//     { t: "address", v: factoryAddr },
//     { t: "bytes32", v: saltHex },
//     { t: "bytes32", v: initCodeHash }
//   );
//   return "0x" + packed.slice(-40);
// }

// ========= Express App =========
const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(cors({ origin: 'http://localhost:3000' }))
const ERC20 = compileERC20Token();

app.post("/predict", verifySigner, async (req, res) => {
  try {
    const {
      factoryAddress,
      rpc = "https://rpc.ankr.com/eth_sepolia",
      name = "MyToken",
      symbol = "MTK",
      supply = "1000",
      decimals = 18,
      suffix = "7777",
    } = req.body;


    const web3 = new Web3(rpc);

    // buat initCode ERC20 (constructor encoded)
    const encodedArgs = web3.eth.abi.encodeParameters(
      ["string", "string", "uint256", "uint8"],
      [name, symbol, supply, decimals]
    );
    const initCode = ERC20.bytecode + encodedArgs.slice(2);

    // cari salt agar predicted address akhiran "7777"
    const cpuCount = Math.max(1, os.cpus().length - 1);
    let found = null;

    await new Promise((resolve) => {
      const workers = [];
      for (let i = 0; i < cpuCount; i++) {
        const worker = new Worker(__filename, {
          workerData: {
            factoryAddress,
            initCode,
            targetSuffix: suffix.toLowerCase(),
            startIndex: i,
            step: cpuCount,
            maxIndex: 500000,
            rpc,
          },
        });

        workers.push(worker);
        worker.on("message", (msg) => {
          if (msg.found && !found) {
            found = msg;
            for (const w of workers) w.terminate();
            resolve();
          }
        });
      }

      // timeout 30 detik
      setTimeout(() => resolve(), 30_000);
    });

    if (!found) throw new Error("Tidak menemukan vanity address dalam waktu wajar.");

    return res.json({
      success: true,
      factoryAddress,
      salt: found.salt,
      predictedAddress: found.address,
      suffix,
      initCode
    });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

app.post("/sign", async (req, res) => {
  const privateKey = "0xc3dcd626eb26b390164820d254cc11444304675ce88f0a5aa048bcc118b266d7"; // sementara pakai ini di lokal test
  const wallet = new ethers.Wallet(privateKey);
  try {
    const {
      name,
      symbol,
      initialSupply,
      decimals,
      rpc
    } = req.body;

    const message = JSON.stringify({
      name,
      symbol,
      initialSupply,
      decimals,
      rpc
    });
    const signature = await wallet.signMessage(message);
    res.json({
      signer: wallet.address,
      message,
      signature,
    });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

const PORT = 9000;
app.listen(PORT, () => console.log(`🚀 Server ready at http://localhost:${PORT}`));
