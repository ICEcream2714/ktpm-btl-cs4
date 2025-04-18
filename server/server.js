require("dotenv").config()
const express = require("express")
const mongoose = require("mongoose")
const bodyParser = require("body-parser")
const path = require("path")
const http = require("http")
const { Server } = require("socket.io")
const redis = require("redis")

const app = express()
const server = http.createServer(app)
const io = new Server(server)
const port = process.env.PORT || 8080
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/cs4"

const MarketData = require("./models/MarketData")

const mongoConnect = () => {
  console.log("Attempting MongoDB connection...")
  const timeout = 5000
  mongoose
    .connect(MONGO_URI)
    .catch((err) => {
      console.error("MongoDB connection error:")
      console.log(`Retrying MongoDB connection in ${parseInt(timeout / 1000)} seconds...`)
      setTimeout(mongoConnect, timeout)
    })
}

mongoConnect()
mongoose.connection.on("connected", () => console.log("MongoDB connected"))
mongoose.connection.on("disconnected", () => {
  console.error("MongoDB disconnected! Attempting to reconnect...")
  mongoConnect()
})

mongoose.connection.on("reconnected", () => console.log("MongoDB reconnected"))

const redisClient = redis.createClient({
  host: "cs4_redis",
  port: 6379
})

const redisConnect = async () => {
  console.log("Attempting Redis connection...")
  await redisClient.connect()
  console.log("Connected to Redis. Flushing cache...")
  await redisClient.flushAll()
}

redisConnect()
redisClient.on("connect", () => console.log("Connected to Redis"))
redisClient.on("ready", () => console.log("Redis is ready"))
redisClient.on("error", (err) => console.error("Redis error:", err))
redisClient.on("end", () => console.log("Redis connection closed"))

app.use(bodyParser.json())

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
    if (mongoose.Types.ObjectId.isValid(key)) {
      MarketData.findById(key)
        .then(marketData => {
          if (marketData) {
            socket.emit('value_update', JSON.stringify(marketData));
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

app.post("/market-data", async (req, res) => {
    const { dataType, dataPrice, timestamp } = req.body
  
    const newMarketData = new MarketData({
      dataType,
      dataPrice,
      timestamp,
    })
  
    try {
        const savedData = await newMarketData.save()

        // Broadcast the update to clients watching this data
        broadcastUpdate(savedData._id.toString(), JSON.stringify(savedData))

        res.status(201).json(savedData)
    } catch (err) {
        res.status(400).json({ error: err.message })
    }
  })

const getCachedMarketData = async (startOfDay, endOfDay) => {
    const cacheKey = `market-data:${startOfDay.toISOString()}:${endOfDay.toISOString()}`
    const cachedData = await redisClient.get(cacheKey)

    if (cachedData) {
        console.log("Cache hit")
        return JSON.parse(cachedData)
    }

    console.log("Cache miss")
    const marketData = await MarketData.aggregate([
        {
            $match: { timestamp: { $lte: endOfDay } }
        },
        {
            $sort: { timestamp: -1 }
        },
        {
            $group: {
                _id: "$dataType",
                latestEntry: { $first: "$$ROOT" }
            }
        },
        {
            $replaceRoot: { newRoot: "$latestEntry" }
        }
    ])

    if (marketData.length > 0) {
        await redisClient.set(cacheKey, JSON.stringify(marketData), {
            EX: 3600 // Cache expires in 1 hour
        })
    }

    return marketData
}

app.get("/market-data", async (req, res) => {
    const { day, month, year } = req.query

    try {
        let startOfDay = new Date()
        startOfDay.setHours(0, 0, 0, 0)
        let endOfDay = new Date()
        endOfDay.setHours(23, 59, 59, 999)

        if (day && month && year) {
            const historyDay = parseInt(day, 10)
            const historyMonth = parseInt(month, 10) - 1
            const historyYear = parseInt(year, 10)

            startOfDay = new Date(historyYear, historyMonth, historyDay, 0, 0, 0, 0)
            endOfDay = new Date(historyYear, historyMonth, historyDay, 23, 59, 59, 999)
        }

        const marketData = await getCachedMarketData(startOfDay, endOfDay)

        if (marketData.length === 0) {
            return res.status(404).json({ message: "No market data found for the specified or nearest day" })
        }

        res.status(200).json(marketData)
    } catch (err) {
        res.status(400).json({ error: err.message })
    }
})

app.delete("/market-data/:id", async (req, res) => {
  const { id } = req.params
  try {
    const deletedData = await MarketData.findByIdAndDelete(id)

    if (!deletedData) {
      return res.status(404).json({ message: "Market data not found" })
    }

    // Notify clients about the deletion
    broadcastUpdate(id, JSON.stringify({ deleted: true, id }));

    res
      .status(200)
      .json({ message: "Market data deleted successfully", deletedData })
  } catch (err) {
    res.send(err)
  }
});

app.get("/viewer/:id", (req, res) => {
  const id = req.params.id
  res.sendFile(path.join(__dirname, "viewer.html"))
})

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "viewer.html"));
});

// Serve static files (if needed)
app.use(express.static(path.join(__dirname, 'public')));

// Use server.listen instead of app.listen for Socket.IO
server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});