require("dotenv").config()
const express = require("express")
const mongoose = require("mongoose")
const bodyParser = require("body-parser")
const path = require("path")
const http = require("http")
const { Server } = require("socket.io")
const redis = require("redis")
const cors = require("cors") // Add CORS package
const rabbitmqLib = require("./lib/rabbitmq")
let useRabbitMQ = true // Set to false to disable RabbitMQ

const app = express()
const server = http.createServer(app)
// Configure Socket.IO with CORS
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000", "http://localhost:5173"], // Allow React dev servers
    methods: ["GET", "POST", "DELETE"],
    credentials: true,
  },
})
const port = process.env.PORT || 8080
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/cs4"

const MarketData = require("./models/MarketData")

//Cache-aside toggle, data entry const
const CACHE_ASIDE_ENABLED = true
const MAX_DATA_ENTRIES = 20

// Apply CORS middleware to all routes
app.use(
  cors({
    origin: ["http://localhost:3000", "http://localhost:5173"], // Allow React dev servers
    methods: ["GET", "POST", "DELETE"],
    credentials: true,
  })
)

const mongoConnect = () => {
  console.log("Attempting MongoDB connection...")
  const timeout = 5000
  mongoose.connect(MONGO_URI).catch((err) => {
    console.error("MongoDB connection error:")
    console.log(
      `Retrying MongoDB connection in ${parseInt(timeout / 1000)} seconds...`
    )
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
  port: 6379,
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

// Store active socket connections by key (can be ID or data type)
const activeConnections = new Map()

// Socket.IO connection handler
io.on("connection", (socket) => {
  console.log("A user connected:", socket.id)

  // Handle client subscription to a specific key (ID or data type)
  socket.on("subscribe", async (key) => {
    console.log(`Client ${socket.id} subscribed to key: ${key}`)

    // Store the socket connection with this key
    if (!activeConnections.has(key)) {
      activeConnections.set(key, new Set())
    }
    activeConnections.get(key).add(socket.id)

    // Associate the key with this socket for cleanup on disconnect
    if (!socket.subscriptions) {
      socket.subscriptions = new Set()
    }
    socket.subscriptions.add(key)

    try {
      let cachedData = await redisClient.get("market-data:all")
      if (!cachedData) {
        console.log("Cache miss during subscription. Getting cache...")
        await getCachedMarketData()
        cachedData = await redisClient.get("market-data:all")
        console.log("Cache on subscription generated successfully.")
      }

      const marketData = JSON.parse(cachedData)

      // If the key is a MongoDB ID, send the specific item
      if (mongoose.Types.ObjectId.isValid(key)) {
        const item = marketData.find((data) => data._id === key)
        if (item) {
          socket.emit("value_update", JSON.stringify(item))
        }
      }
      // If the key is a data type, send items of that type
      else {
        const items = marketData.filter((data) => data.dataType === key).slice(0, 10)
        if (items.length > 0) {
          socket.emit(
            "type_update",
            JSON.stringify({
              type: key,
              items: items,
            })
          )
        }
      }
    } catch (err) {
      console.error("Error fetching data from cache:", err)
    }
  })

  // Handle unsubscribe from all keys
  socket.on("unsubscribe_all", () => {
    console.log(`Client ${socket.id} unsubscribing from all keys`)

    // Remove this socket from all subscriptions
    if (socket.subscriptions) {
      socket.subscriptions.forEach((key) => {
        if (activeConnections.has(key)) {
          activeConnections.get(key).delete(socket.id)
          console.log(`Removed client ${socket.id} from key: ${key}`)

          // Clean up empty sets
          if (activeConnections.get(key).size === 0) {
            activeConnections.delete(key)
            console.log(`Removed empty key: ${key}`)
          }
        }
      })

      // Clear subscriptions for this socket
      socket.subscriptions.clear()
    }
  })

  // Handle client disconnection
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id)

    // Remove this socket from all subscriptions
    if (socket.subscriptions) {
      socket.subscriptions.forEach((key) => {
        if (activeConnections.has(key)) {
          activeConnections.get(key).delete(socket.id)
          // Clean up empty sets
          if (activeConnections.get(key).size === 0) {
            activeConnections.delete(key)
          }
        }
      })
    }
  })
})

// Helper function to broadcast updates to all clients subscribed to a key
function broadcastUpdate(key, data) {
  if (activeConnections.has(key)) {
    activeConnections.get(key).forEach((socketId) => {
      io.to(socketId).emit("value_update", data)
    })
  }
}

function broadcastTypeUpdate(dataType, savedData) {
  if (activeConnections.has(dataType)) {
    const clients = activeConnections.get(dataType)
    console.log(`Broadcasting type update to ${clients.size} client(s) for type: ${dataType}`)

    clients.forEach((socketId) => {
      io.to(socketId).emit("type_update", JSON.stringify({
        type: dataType,
        item: savedData,
      }))
    })
  } else {
    console.log(`No clients subscribed to type: ${dataType}`)
  }
}

const getCachedMarketData = async () => {
  const cacheKey = `market-data:all`

  if (CACHE_ASIDE_ENABLED) {
    const cachedData = await redisClient.get(cacheKey)

    if (cachedData) {
      console.log("Cache hit")
      return JSON.parse(cachedData)
    }

    console.log("Cache miss")
  }

  const marketData = await MarketData.aggregate([
    {
      $sort: { timestamp: -1 },
    },
    {
      $group: {
        _id: "$dataType",
        latestEntries: { $push: "$$ROOT" },
      },
    },
    {
      $project: {
        _id: 1,
        latestEntries: { $slice: ["$latestEntries", MAX_DATA_ENTRIES] },
      },
    },
    {
      $unwind: "$latestEntries",
    },
    {
      $replaceRoot: { newRoot: "$latestEntries" },
    },
  ])

  if (CACHE_ASIDE_ENABLED && marketData.length > 0) {
    await redisClient.set(cacheKey, JSON.stringify(marketData), {
      EX: 3600,
    })
  }

  return marketData
}

app.get("/market-data/all", async (req, res) => {

  try {
    const marketData = await getCachedMarketData()

    if (marketData.length === 0) {
      return res.status(404).json({
        message: "No market data found",
      })
    }

    res.status(200).json(marketData)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

app.post("/market-data", async (req, res) => {
  console.log("\n------- MARKET DATA FLOW: HTTP REQUEST RECEIVED -------")
  console.log(`Request body: ${JSON.stringify(req.body)}`)

  const { dataType, dataPrice, timestamp, messageId, _benchmarkSent } =
    req.body

  const newMarketData = new MarketData({
    dataType,
    dataPrice,
    timestamp,
  })

  try {
    // Step 1: Save to MongoDB
    console.log("FLOW STEP 1: Saving data to MongoDB...")
    const startSave = Date.now()
    const savedData = await newMarketData.save()
    console.log(`✓ MongoDB save complete (${Date.now() - startSave}ms)`)
    console.log(`✓ Document ID: ${savedData._id}`)

    if (CACHE_ASIDE_ENABLED) {
      console.log("Invalidating cache due to new data...")
      const cacheKey = `market-data:all`
      await redisClient.del(cacheKey)
      console.log(`Cache invalidated for key: ${cacheKey}`)

      console.log("Getting new cache...")
      await getCachedMarketData() // Regenerate the cache
      console.log("New cache generated successfully.")
    }

    if (useRabbitMQ === true) {
      // Step 2: PUBLISHER ROLE - Publish to RabbitMQ message broker only
      console.log(
        "\nFLOW STEP 2: PUBLISHER sending messages to RabbitMQ broker..."
      )

      // Publish to ID-based exchange
      console.log(
        `Publishing to MARKET_DATA_EXCHANGE with key: ${savedData._id}`
      )
      const startRabbitMQ1 = Date.now()
      const publishResult1 = await rabbitmqLib.publishMarketDataUpdate(
        savedData._id.toString(),
        savedData
      )
      console.log(
        `✓ PUBLISHER sent to market data exchange: ${
          publishResult1 ? "success" : "failed"
        } (${Date.now() - startRabbitMQ1}ms)`
      )

      // Publish to type-based exchange
      console.log(
        `Publishing to MARKET_DATA_TYPE_EXCHANGE with key: ${dataType}`
      )
      const startRabbitMQ2 = Date.now()
      const publishResult2 = await rabbitmqLib.publishMarketDataTypeUpdate(
        dataType,
        savedData
      )
      console.log(
        `✓ PUBLISHER sent to market data type exchange: ${
          publishResult2 ? "success" : "failed"
        } (${Date.now() - startRabbitMQ2}ms)`
      )
    } else {
      // Broadcast via Socket.IO when RabbitMQ is disabled
      broadcastUpdate(savedData._id.toString(), JSON.stringify(savedData))
      console.log(`Broadcasting via Socket.IO to type: ${dataType}`)
      broadcastTypeUpdate(dataType, savedData)
    }

    console.log("\n✓ Market data flow complete - response sent to client")
    console.log("---------------------------------------------------\n")

    res.status(201).json(savedData)
  } catch (err) {
    console.error("❌ ERROR in market data flow:", err.message)
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

    // Invalidate the single cache key
    if (CACHE_ASIDE_ENABLED) {
      console.log("Invalidating cache due to deletion...")
      const cacheKey = `market-data:all`
      await redisClient.del(cacheKey)
      console.log(`Cache invalidated for key: ${cacheKey}`)
    }

    if (useRabbitMQ === true) {
      // PUBLISHER ROLE - Publish deletion event to RabbitMQ
      console.log(
        "\n------- MARKET DATA DELETION: PUBLISHING TO RABBITMQ -------"
      )
      console.log(`Publishing deletion event for ID: ${id}`)
      const deletionEvent = {
        deleted: true,
        id,
        dataType: deletedData.dataType,
      }

      // Publish to ID-based exchange
      const publishResult1 = await rabbitmqLib.publishMarketDataUpdate(
        id,
        deletionEvent
      )
      console.log(
        `✓ PUBLISHER sent deletion event to market data exchange: ${
          publishResult1 ? "success" : "failed"
        }`
      )

      // Publish to type-based exchange to notify type subscribers
      const publishResult2 = await rabbitmqLib.publishMarketDataTypeUpdate(
        deletedData.dataType,
        {
          type: deletedData.dataType,
          deleted: true,
          item: { _id: id, dataType: deletedData.dataType },
        }
      )
      console.log(
        `✓ PUBLISHER sent deletion event to market data type exchange: ${
          publishResult2 ? "success" : "failed"
        }`
      )
      console.log("---------------------------------------------------\n")
    } else {
      // Broadcast via Socket.IO when RabbitMQ is disabled
      broadcastUpdate(id, JSON.stringify({ deleted: true }))
      console.log(`Broadcasting deletion via Socket.IO for ID: ${id}`)
    }

    res.status(200).json({
      message: "Market data deleted successfully",
      deletedData,
    })
  } catch (err) {
    console.error("Error deleting market data:", err)
    res.status(500).json({ error: err.message })
  }
})

app.get("/viewer/:id", (req, res) => {
  const id = req.params.id
  res.sendFile(path.join(__dirname, "viewer.html"))
})

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "viewer.html"))
})

// Serve static files (if needed)
app.use(express.static(path.join(__dirname, "public")))

// Replace with startup function that initializes everything in the correct order
async function startServer() {
  try {
    // Connect to MongoDB (already done via mongoConnect())
    // We don't need to connect to Redis here, as it's already connected above
    // await redisConnect() - REMOVED THIS LINE to avoid duplicate connections

    // Connect to RabbitMQ
    await rabbitmqLib.connect()

    // After RabbitMQ is connected, set up consumers
    setupRabbitMQConsumers()

    // Start Express server
    server.listen(port, () => {
      console.log(`Server is running on port ${port}`)
    })
  } catch (err) {
    console.error("Error starting server:", err)
  }
}

// Function to set up RabbitMQ consumers
function setupRabbitMQConsumers() {
  if (useRabbitMQ === false) {
    console.log("RabbitMQ is disabled. Skipping consumer setup.")
    return
  }
  // SUBSCRIBER ROLE - Subscribe to market data updates by ID
  rabbitmqLib.subscribeToMarketDataUpdates((id, messageContent) => {
    console.log("\n------- SUBSCRIBER ROLE: ID-BASED MESSAGE RECEIVED -------")
    console.log(
      `SUBSCRIBER received message from MARKET_DATA_EXCHANGE with routing key: ${id}`
    )

    try {
      // Parse the message if it's a string
      const startParse = Date.now()
      const data =
        typeof messageContent === "string"
          ? JSON.parse(messageContent)
          : messageContent
      console.log(
        `✓ SUBSCRIBER parsed message content (${Date.now() - startParse}ms)`
      )
      console.log(
        `✓ Message data: ${JSON.stringify(data).substring(0, 150)}...`
      )

      // Forward to Socket.IO clients - SUBSCRIBER becomes a PUBLISHER to Socket.IO
      console.log(
        `FLOW STEP: MESSAGE BROKER → SUBSCRIBER → Socket.IO (ID-based routing)`
      )
      console.log(
        `SUBSCRIBER checking for active Socket.IO clients subscribed to ID: ${id}`
      )

      if (activeConnections.has(id)) {
        const clients = activeConnections.get(id)
        console.log(
          `✓ Found ${clients.size} Socket.IO client(s) subscribed to ID: ${id}`
        )

        const startBroadcast = Date.now()
        broadcastUpdate(id, JSON.stringify(data))
        console.log(
          `✓ SUBSCRIBER forwarded message to ${
            clients.size
          } Socket.IO client(s) (${Date.now() - startBroadcast}ms)`
        )
      } else {
        console.log(`ℹ No Socket.IO clients subscribed to ID: ${id}`)
      }

      console.log(`------- END OF SUBSCRIBER FLOW (ID-BASED) -------\n`)
    } catch (err) {
      console.error("❌ Error processing message:", err)
      console.error(
        `Original message content: ${messageContent.substring(0, 150)}...`
      )
    }
  })

  // SUBSCRIBER ROLE - Subscribe to market data updates by type
  rabbitmqLib.subscribeToMarketDataTypeUpdates((dataType, messageContent) => {
    console.log(
      "\n------- SUBSCRIBER ROLE: TYPE-BASED MESSAGE RECEIVED -------"
    )
    console.log(
      `SUBSCRIBER received message from MARKET_DATA_TYPE_EXCHANGE with routing key: ${dataType}`
    )

    try {
      // Parse the message if it's a string
      const startParse = Date.now()
      const data =
        typeof messageContent === "string"
          ? JSON.parse(messageContent)
          : messageContent
      console.log(
        `✓ SUBSCRIBER parsed message content (${Date.now() - startParse}ms)`
      )
      console.log(`✓ Message type: ${data.type}`)

      if (data.item) {
        console.log(
          `✓ Single item update for ${dataType}, ID: ${data.item._id}`
        )
      } else if (data.items) {
        console.log(
          `✓ Bulk update with ${data.items.length} items for ${dataType}`
        )
      }

      // Forward to Socket.IO clients - SUBSCRIBER becomes a PUBLISHER to Socket.IO
      console.log(
        `FLOW STEP: MESSAGE BROKER → SUBSCRIBER → Socket.IO (type-based routing)`
      )
      console.log(
        `SUBSCRIBER checking for active Socket.IO clients subscribed to type: ${dataType}`
      )

      if (activeConnections.has(dataType)) {
        const clients = activeConnections.get(dataType)
        console.log(
          `✓ Found ${clients.size} Socket.IO client(s) subscribed to type: ${dataType}`
        )

        const startBroadcast = Date.now()
        clients.forEach((socketId) => {
          io.to(socketId).emit("type_update", JSON.stringify(data))
        })
        console.log(
          `✓ SUBSCRIBER forwarded message to ${
            clients.size
          } Socket.IO client(s) (${Date.now() - startBroadcast}ms)`
        )
      } else {
        console.log(`ℹ No Socket.IO clients subscribed to type: ${dataType}`)
      }

      console.log(`------- END OF SUBSCRIBER FLOW (TYPE-BASED) -------\n`)
    } catch (err) {
      console.error("❌ Error parsing message:", err)
      console.error(
        `Original message content: ${messageContent.substring(0, 150)}...`
      )
    }
  })

  console.log("✓ RabbitMQ SUBSCRIBERS set up successfully")
}

// Start the server
startServer()
