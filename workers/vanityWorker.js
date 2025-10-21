const { parentPort, workerData } = require("worker_threads");
const { Web3 } = require("web3");

const { factoryAddress, initCode, targetSuffix, startIndex, step, maxIndex, rpc } = workerData;
const web3 = new Web3(rpc);

// Precompute initCode hash
const initCodeHash = web3.utils.keccak256(initCode);

// Reusable 32-byte buffer untuk salt
const saltBuffer = Buffer.alloc(32);

let lastProgress = 0;

for (let i = startIndex; i < maxIndex; i += step) {
  // tulis BigInt ke 8 byte terakhir buffer
  saltBuffer.writeBigUInt64BE(BigInt(i), 24);
  const saltHex = "0x" + saltBuffer.toString("hex");

  // compute CREATE2
  const packed = web3.utils.soliditySha3(
    { t: "bytes1", v: "0xff" },
    { t: "address", v: factoryAddress },
    { t: "bytes32", v: saltHex },
    { t: "bytes32", v: initCodeHash }
  );
  const predicted = "0x" + packed.slice(-40);

  // Progress per 5%
  const progress = Math.floor(((i - startIndex) / (maxIndex - startIndex)) * 100);
  if (progress >= lastProgress + 5) {
    parentPort.postMessage({ progress, thread: startIndex });
    console.log(`[Thread ${startIndex}] Progress: ${progress}%`);
    lastProgress = progress;
  }

  // Found?
  if (predicted.toLowerCase().endsWith(targetSuffix)) {
    parentPort.postMessage({ found: true, salt: saltHex, address: predicted });
    console.log(`[Thread ${startIndex}] FOUND! ${predicted}`);
    process.exit(0);
  }
}

// Selesai tanpa hasil
parentPort.postMessage({ found: false });
console.log(`[Thread ${startIndex}] Done, not found`);
process.exit(0);

