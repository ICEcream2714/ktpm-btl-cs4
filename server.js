require("dotenv").config();
const express = require('express');
const mongoose = require("mongoose");
const bodyParser = require('body-parser');
const path = require('path');
const lib = require('./utils');
const app = express();
const port = process.env.PORT || 8080;
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/cs4";

const GoldPrice = require("./models/GoldPrice");


mongoose
  .connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

app.use(bodyParser.json());


app.post("/gold-price", async (req, res) => {
    const { goldType, goldPrice } = req.body;
  
    const newGoldPrice = new GoldPrice({
      goldType,
      goldPrice,
    });
  
    try {
        const savedPrice = await newGoldPrice.save();
        res.status(201).json(savedPrice);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
  });
  
// app.get("/gold-price", async (req, res) => {
//     try {
//         goldType = "PNJ"
//         const latestPrice = await GoldPrice.find({ goldType }).sort({ timestamp: -1 });
//         res.status(200).json(latestPrice);
//     } catch (err) {
//         res.status(400).json({ error: err.message });
//     }
// });

app.get("/gold-price", async (req, res) => {

    const { day, month, year } = req.query

    let startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    let endOfDay = new Date()
    endOfDay.setHours(23, 59, 59, 0)

    if (day && month && year) {
        const gold_history_day = parseInt(day, 10);
        const gold_history_month = parseInt(month, 10) - 1;
        const gold_history_year = parseInt(year, 10);

        startOfDay = new Date(gold_history_year, gold_history_month, gold_history_day, 0, 0, 0, 0);
        endOfDay = new Date(gold_history_year, gold_history_month, gold_history_day, 23, 59, 59, 999)
    }

    
    console.log(startOfDay, endOfDay)
    try {
        const goldPricesToday = await GoldPrice.find({ timestamp: { $gte: startOfDay, $lte: endOfDay } }).sort({ timestamp: -1 });
        if (goldPricesToday.length === 0) {
        return res.status(404).json({ message: "No gold prices found for today" });
        }
        
        res.status(200).json(goldPricesToday);
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

        res.status(200).json({ message: "Gold price deleted successfully", deletedPrice });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});



// app.post('/add', async (req, res) => {
//     try {
//         const { key, value } = req.body;
//         await lib.write(key, value);
//         res.send("Insert a new record successfully!");
//     } catch (err) {
//         res.send(err.toString());
//     }
// });

// app.get('/get/:id', async (req, res) => {
//     try {
//         const id = req.params.id;
//         const value = await lib.view(id);
//         res.status(200).send(value);
//     } catch (err) {
//         res.send(err)
//     }
// });

// app.get('/viewer/:id', (req, res) => {
//     const id = req.params.id;
//     res.sendFile(path.join(__dirname, "viewer.html"));
// });

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'viewer.html'));
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});