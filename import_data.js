require("dotenv").config();
const mongoose = require("mongoose");
const fs = require("fs");
const GoldPrice = require("./models/GoldPrice");
const moment = require("moment");
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/cs4"

const connectDB = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("MongoDB connected");
    } catch (error) {
        console.error("Error connecting to MongoDB:", error);
        process.exit(1);
    }
};


const importGoldPrices = async () => {
    try {
        const data = fs.readFileSync("c:/Users/hieu/Desktop/gold_prices.json", "utf-8");
        const goldPrices = JSON.parse(`[${data.trim().replace(/\n/g, ",")}]`);

        const formattedGoldPrices = goldPrices.map((price) => ({
            ...price,
            timestamp: moment(price.timestamp, "DD/MM/YYYY HH:mm:ss").toDate(),
        }));

        await GoldPrice.insertMany(formattedGoldPrices);
        console.log("Gold prices imported successfully");
        process.exit();
    } catch (error) {
        console.error("Error importing gold prices:", error);
        process.exit(1);
    }
};


const run = async () => {
    await connectDB();
    await importGoldPrices();
};

run();