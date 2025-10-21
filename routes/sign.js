require("dotenv").config();
const express = require("express");
const { ethers } = require("ethers");

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { name, symbol, initialSupply, decimals, rpc } = req.body;
    const message = JSON.stringify({ name, symbol, initialSupply, decimals, rpc });

    // gunakan privateKey hanya untuk testing
    const privateKey = process.env.LOCAL_SIGNER_KEY;
    const wallet = new ethers.Wallet(privateKey);
    const signature = await wallet.signMessage(message);

    res.json({ signer: wallet.address, message, signature });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
