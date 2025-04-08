require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");

const lib = require("./utils");
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const port = process.env.PORT || 8080;
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/cs4";

const GoldPrice = require("./models/GoldPrice");

mongoose
  .connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

app.use(bodyParser.json());

app.post("/add", async (req, res) => {
  try {
    const { key, value } = req.body;
    await lib.write(key, value);
    res.send("Insert a new record successfully!");
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete("/gold-price/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const deletedPrice = await GoldPrice.findByIdAndDelete(id);

    if (!deletedPrice) {
      return res.status(404).json({ message: "Gold price not found" });
    }

    res
      .status(200)
      .json({ message: "Gold price deleted successfully", deletedPrice });
  } catch (err) {
    res.send(err);
  }
});

app.get("/get/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const value = await lib.view(id);
    res.status(200).send(value);
  } catch (err) {
    res.send(err);
  }
});

app.get("/viewer/:id", (req, res) => {
  const id = req.params.id;
  res.sendFile(path.join(__dirname, "viewer.html"));
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "viewer.html"));
});

// Use server.listen instead of app.listen for Socket.IO
server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
