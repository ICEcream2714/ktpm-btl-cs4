require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");

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

// Store active socket connections by key
const activeConnections = new Map();

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  
  // Handle client subscription to a specific key
  socket.on('subscribe', (key) => {
    console.log(`Client ${socket.id} subscribed to key: ${key}`);
    
    // Store the socket connection with this key
    if (!activeConnections.has(key)) {
      activeConnections.set(key, new Set());
    }
    activeConnections.get(key).add(socket.id);
    
    // Associate the key with this socket for cleanup on disconnect
    socket.key = key;
    
    // Send the current value for this key if available
    // For example, if the key is a gold price ID, fetch and send the current data
    if (mongoose.Types.ObjectId.isValid(key)) {
      GoldPrice.findById(key)
        .then(goldPrice => {
          if (goldPrice) {
            socket.emit('value_update', JSON.stringify(goldPrice));
          } else {
            socket.emit('value_update', 'No data found for this key');
          }
        })
        .catch(err => {
          console.error('Error fetching data for key:', key, err);
          socket.emit('value_update', 'Error fetching data');
        });
    }
  });
  
  // Handle client disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // Remove this socket from activeConnections
    if (socket.key && activeConnections.has(socket.key)) {
      activeConnections.get(socket.key).delete(socket.id);
      // Clean up empty sets
      if (activeConnections.get(socket.key).size === 0) {
        activeConnections.delete(socket.key);
      }
    }
  });
});

// Helper function to broadcast updates to all clients subscribed to a key
function broadcastUpdate(key, data) {
  if (activeConnections.has(key)) {
    activeConnections.get(key).forEach(socketId => {
      io.to(socketId).emit('value_update', data);
    });
  }
}

app.post("/gold-price", async (req, res) => {
  const { goldType, goldBuyPrice, goldSellPrice, timestamp } = req.body;

  const newGoldPrice = new GoldPrice({
    goldType,
    goldBuyPrice,
    goldSellPrice,
    timestamp,
  });

  try {
    const savedPrice = await newGoldPrice.save();
    
    // Broadcast the update to clients watching this gold price
    broadcastUpdate(savedPrice._id.toString(), JSON.stringify(savedPrice));
    
    res.status(201).json(savedPrice);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/gold-price", async (req, res) => {
  const { day, month, year } = req.query;

  try {
    let startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    let endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    if (day && month && year) {
      const gold_history_day = parseInt(day, 10);
      const gold_history_month = parseInt(month, 10) - 1;
      const gold_history_year = parseInt(year, 10);

      startOfDay = new Date(gold_history_year, gold_history_month, gold_history_day, 0, 0, 0, 0);
      endOfDay = new Date(gold_history_year, gold_history_month, gold_history_day, 23, 59, 59, 999);
    }

    let goldPrices = await GoldPrice.find({ timestamp: { $gte: startOfDay, $lte: endOfDay } }).sort({ timestamp: -1 });

    if (goldPrices.length === 0) {
      const nearestEntryBefore = await GoldPrice.findOne({ timestamp: { $lt: startOfDay } }).sort({ timestamp: -1 });
      const nearestEntryAfter = await GoldPrice.findOne({ timestamp: { $gt: endOfDay } }).sort({ timestamp: 1 });

      let nearestEntry = null;

      if (nearestEntryBefore && nearestEntryAfter) {
        const diffBefore = Math.abs(startOfDay - nearestEntryBefore.timestamp);
        const diffAfter = Math.abs(nearestEntryAfter.timestamp - startOfDay);
        nearestEntry = diffBefore <= diffAfter ? nearestEntryBefore : nearestEntryAfter;
      } else if (nearestEntryBefore) {
        nearestEntry = nearestEntryBefore;
      } else if (nearestEntryAfter) {
        nearestEntry = nearestEntryAfter;
      }

      if (nearestEntry) {
        const nearestDay = nearestEntry.timestamp;
        const nearestStartOfDay = new Date(nearestDay);
        nearestStartOfDay.setHours(0, 0, 0, 0);
        const nearestEndOfDay = new Date(nearestDay);
        nearestEndOfDay.setHours(23, 59, 59, 999);

        goldPrices = await GoldPrice.find({
          timestamp: { $gte: nearestStartOfDay, $lte: nearestEndOfDay },
        }).sort({ timestamp: -1 });
      }
    }

    if (goldPrices.length === 0) {
      return res.status(404).json({ message: "No gold prices found for the specified or nearest day" });
    }

    res.status(200).json(goldPrices);
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

    // Notify clients about the deletion
    broadcastUpdate(id, JSON.stringify({ deleted: true, id }));

    res
      .status(200)
      .json({ message: "Gold price deleted successfully", deletedPrice });
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

// Serve static files (if needed)
app.use(express.static(path.join(__dirname, 'public')));

// Use server.listen instead of app.listen for Socket.IO
server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});