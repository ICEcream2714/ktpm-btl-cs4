require("dotenv").config();
const mongoose = require("mongoose");
const fs = require("fs");
const MarketData = require("./models/MarketData");
const moment = require("moment");
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/cs4";

const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("MongoDB connected");
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    process.exit(1);
  }
};

const importMarketData = async () => {
  try {
    await MarketData.deleteMany({});
    console.log("All existing market data deleted");

    const data = fs.readFileSync("market_data.json", "utf-8");
    const marketData = JSON.parse(`[${data.trim().replace(/\n/g, ",")}]`);

    const formattedMarketData = marketData.map((data) => ({
      dataType: data.dataType,
      dataPrice: data.dataPrice,
      timestamp: moment(data.timestamp, "DD/MM/YYYY HH:mm:ss").toDate(),
    }));

    await MarketData.insertMany(formattedMarketData);
    console.log("Market data imported successfully");
    process.exit();
  } catch (error) {
    console.error("Error importing market data:", error);
    process.exit(1);
  }
};

const run = async () => {
  await connectDB();
  await importMarketData();
};

run();
