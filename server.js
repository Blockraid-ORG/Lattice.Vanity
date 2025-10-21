require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { verifySigner } = require("./middlewares/verifySigner");
const predictRoute = require("./routes/predict");
const signRoute = require("./routes/sign");

const app = express();
app.use(express.json({ limit: "1mb" }));

const origins = ['http://localhost:3000', process.env.CLIENT_ORIGIN].filter(Boolean);
app.use(cors({ origin: origins }));

app.use("/predict", verifySigner, predictRoute);
app.use("/sign", signRoute);

const PORT = process.env.PORT || 9000;
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
