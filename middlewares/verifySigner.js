
const { ethers } = require("ethers");

const verifySigner = (req, res, next) =>{
  try {
    const { address, signature, message } = req.body;

    if (!address || !signature || !message) {
      return res.status(400).json({ error: "Missing address, signature, or message" });
    }

    let messageForVerify = message;

    if (typeof message === "string" && !message.startsWith("0x")) {
      try {
        messageForVerify = ethers.hexlify(ethers.toUtf8Bytes(message));
      } catch (e) {
        console.error("Error converting message to hex:", e);
        return res.status(400).json({ error: "Invalid message format" });
      }
    }

    const recoveredAddress = ethers.verifyMessage(messageForVerify, signature);

    if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
      return res.status(401).json({ error: "Invalid signature" });
    }
    req.recoveredAddress = recoveredAddress;
    next();

  } catch (error) {
    console.error("verifySigner error:", error);
    return res.status(500).json({ error: "Internal server error during signer verification" });
  }
}

module.exports = { verifySigner };
