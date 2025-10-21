const express = require("express");
const { Worker } = require("worker_threads");
const os = require("os");
const path = require("path");
const { Web3 } = require("web3");
const { compileERC20Token } = require("../utils/compileERC20");

const router = express.Router();
const ERC20 = compileERC20Token();

router.post("/", async (req, res) => {
  try {
    const { factoryAddress, rpc = "https://rpc.ankr.com/eth_sepolia", name = "MyToken", symbol = "MTK", supply = "1000", decimals = 18, suffix = "7777" } = req.body;
    const web3 = new Web3(rpc);
    const encodedArgs = web3.eth.abi.encodeParameters(["string", "string", "uint256", "uint8"], [name, symbol, supply, decimals]);
    const initCode = ERC20.bytecode + encodedArgs.slice(2);

    const cpuCount = Math.max(1, os.cpus().length - 1);
    let found = null;
    await new Promise(resolve => {
      const workers = [];
      for (let i = 0; i < cpuCount; i++) {
        const worker = new Worker(path.resolve(__dirname, "../workers/vanityWorker.js"), {
          workerData: { factoryAddress, initCode, targetSuffix: suffix.toLowerCase(), startIndex: i, step: cpuCount, maxIndex: 500_000, rpc }
        });
        workers.push(worker);
        worker.on("message", msg => {
          if (msg.progress !== undefined) process.stdout.write(`Thread ${msg.thread}: ${msg.progress}%\r`);
          if (msg.found && !found) { found = msg; workers.forEach(w => w.terminate()); resolve(); }
        });
      }
      setTimeout(() => { workers.forEach(w => w.terminate()); resolve(); }, 30_000);
    });

    if (!found) throw new Error("Tidak menemukan vanity address dalam waktu wajar.");

    res.json({ success: true, factoryAddress, salt: found.salt, predictedAddress: found.address, suffix, initCode });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
