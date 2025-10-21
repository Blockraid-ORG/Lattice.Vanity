const { parentPort, workerData } = require("worker_threads");
const { Web3 } = require("web3");

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

let lastProgress = 0;
for (let i = startIndex; i < maxIndex; i += step) {
  const saltHex = "0x" + i.toString(16).padStart(64, "0");
  const predicted = computeCreate2(factoryAddress, saltHex, initCode);

  const progress = Math.floor(((i - startIndex) / (maxIndex - startIndex)) * 100);
  if (progress >= lastProgress + 5) {
    parentPort.postMessage({ progress, thread: startIndex });
    lastProgress = progress;
  }

  if (predicted.toLowerCase().endsWith(targetSuffix)) {
    parentPort.postMessage({ found: true, salt: saltHex, address: predicted });
    process.exit(0);
  }
}

parentPort.postMessage({ found: false });
process.exit(0);
