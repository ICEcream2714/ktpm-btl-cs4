require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");

const app = express();
const port = process.env.PORT || 8080;
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/cs4";

// Middleware
app.use(bodyParser.json());

// MongoDB connection
const mongoConnect = async () => {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log("MongoDB connected successfully.");
  } catch (err) {
    console.error("MongoDB connection error:", err.message);
    process.exit(1); // Exit if connection fails
  }
};

mongoConnect();

// Define a simple schema and model
const MarketDataSchema = new mongoose.Schema({
  dataType: String,
  dataPrice: Number,
  timestamp: Date,
});

const MarketData = mongoose.model("MarketData", MarketDataSchema);

// Routes
app.get("/market-data", async (req, res) => {
  try {
    const marketData = await MarketData.aggregate([
      {
        $sort: { timestamp: -1 } // Sort by timestamp in descending order
      },
      {
        $group: {
          _id: "$dataType", // Group by dataType
          latestEntry: { $first: "$$ROOT" } // Get the latest document in each group
        }
      },
      {
        $replaceRoot: { newRoot: "$latestEntry" } // Replace the root with the latest document
      }
    ]);
    res.status(200).json(marketData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/market-data", async (req, res) => {
  const { dataType, dataPrice, timestamp } = req.body;

  const newMarketData = new MarketData({
    dataType,
    dataPrice,
    timestamp: timestamp || new Date(),
  });

  try {
    const savedData = await newMarketData.save();
    res.status(201).json(savedData);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});