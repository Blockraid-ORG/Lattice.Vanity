const express = require("express");
const { ethers } = require("ethers");

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { name, symbol, initialSupply, decimals, rpc } = req.body;
    const message = JSON.stringify({ name, symbol, initialSupply, decimals, rpc });

    // gunakan privateKey hanya untuk testing
    const privateKey = "0xc3dcd626eb26b390164820d254cc11444304675ce88f0a5aa048bcc118b266d7";
    const wallet = new ethers.Wallet(privateKey);
    const signature = await wallet.signMessage(message);

    res.json({ signer: wallet.address, message, signature });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
