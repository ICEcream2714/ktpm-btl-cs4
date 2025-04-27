require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");
const redis = require("redis");
const cors = require("cors"); // Add CORS package
const rabbitmqLib = require("./lib/rabbitmq");

const app = express();
const server = http.createServer(app);
// Configure Socket.IO with CORS
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000", "http://localhost:5173"], // Allow React dev servers
    methods: ["GET", "POST", "DELETE"],
    credentials: true,
  },
});
const port = process.env.PORT || 8080;
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/cs4";

const MarketData = require("./models/MarketData");

//Cache-aside toggle
const CACHE_ASIDE_ENABLED = true

// Apply CORS middleware to all routes
app.use(
  cors({
    origin: ["http://localhost:3000", "http://localhost:5173"], // Allow React dev servers
    methods: ["GET", "POST", "DELETE"],
    credentials: true,
  })
);

const mongoConnect = () => {
  console.log("Attempting MongoDB connection...");
  const timeout = 5000;
  mongoose.connect(MONGO_URI).catch((err) => {
    console.error("MongoDB connection error:");
    console.log(
      `Retrying MongoDB connection in ${parseInt(timeout / 1000)} seconds...`
    );
    setTimeout(mongoConnect, timeout);
  });
};

mongoConnect();
mongoose.connection.on("connected", () => console.log("MongoDB connected"));
mongoose.connection.on("disconnected", () => {
  console.error("MongoDB disconnected! Attempting to reconnect...");
  mongoConnect();
});

mongoose.connection.on("reconnected", () => console.log("MongoDB reconnected"));

const redisClient = redis.createClient({
  host: "cs4_redis",
  port: 6379,
});

const redisConnect = async () => {
  console.log("Attempting Redis connection...");
  await redisClient.connect();
  console.log("Connected to Redis. Flushing cache...");
  await redisClient.flushAll();
};

redisConnect();
redisClient.on("connect", () => console.log("Connected to Redis"));
redisClient.on("ready", () => console.log("Redis is ready"));
redisClient.on("error", (err) => console.error("Redis error:", err));
redisClient.on("end", () => console.log("Redis connection closed"));

app.use(bodyParser.json());

// Store active socket connections by key (can be ID or data type)
const activeConnections = new Map();

// Socket.IO connection handler
io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  // Handle client subscription to a specific key (ID or data type)
  socket.on("subscribe", (key) => {
    console.log(`Client ${socket.id} subscribed to key: ${key}`);

    // Store the socket connection with this key
    if (!activeConnections.has(key)) {
      activeConnections.set(key, new Set());
    }
    activeConnections.get(key).add(socket.id);

    // Associate the key with this socket for cleanup on disconnect
    if (!socket.subscriptions) {
      socket.subscriptions = new Set();
    }
    socket.subscriptions.add(key);

    // If the key is a MongoDB ID, send the specific item
    if (mongoose.Types.ObjectId.isValid(key)) {
      MarketData.findById(key)
        .then((marketData) => {
          if (marketData) {
            socket.emit("value_update", JSON.stringify(marketData));
          }
        })
        .catch((err) => {
          console.error("Error fetching data for ID:", key, err);
        });
    }
    // If the key is a data type, send all items of that type
    else {
      MarketData.find({ dataType: key })
        .sort({ timestamp: -1 })
        .limit(10)
        .then((items) => {
          if (items && items.length > 0) {
            socket.emit(
              "type_update",
              JSON.stringify({
                type: key,
                items: items,
              })
            );
          }
        })
        .catch((err) => {
          console.error("Error fetching data for type:", key, err);
        });
    }
  });

  // Handle unsubscribe from all keys
  socket.on("unsubscribe_all", () => {
    console.log(`Client ${socket.id} unsubscribing from all keys`);

    // Remove this socket from all subscriptions
    if (socket.subscriptions) {
      socket.subscriptions.forEach((key) => {
        if (activeConnections.has(key)) {
          activeConnections.get(key).delete(socket.id);
          console.log(`Removed client ${socket.id} from key: ${key}`);

          // Clean up empty sets
          if (activeConnections.get(key).size === 0) {
            activeConnections.delete(key);
            console.log(`Removed empty key: ${key}`);
          }
        }
      });

      // Clear subscriptions for this socket
      socket.subscriptions.clear();
    }
  });

  // Handle client disconnection
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    // Remove this socket from all subscriptions
    if (socket.subscriptions) {
      socket.subscriptions.forEach((key) => {
        if (activeConnections.has(key)) {
          activeConnections.get(key).delete(socket.id);
          // Clean up empty sets
          if (activeConnections.get(key).size === 0) {
            activeConnections.delete(key);
          }
        }
      });
    }
  });
});

// Helper function to broadcast updates to all clients subscribed to a key
function broadcastUpdate(key, data) {
  if (activeConnections.has(key)) {
    activeConnections.get(key).forEach((socketId) => {
      io.to(socketId).emit("value_update", data);
    });
  }
}

app.post("/market-data", async (req, res) => {
  console.log("\n------- MARKET DATA FLOW: HTTP REQUEST RECEIVED -------");
  console.log(`Request body: ${JSON.stringify(req.body)}`);

  const { dataType, dataPrice, timestamp, messageId, _benchmarkSent } =
    req.body;

  const newMarketData = new MarketData({
    dataType,
    dataPrice,
    timestamp,
  });

  try {
    // Step 1: Save to MongoDB
    console.log("FLOW STEP 1: Saving data to MongoDB...");
    const startSave = Date.now();
    const savedData = await newMarketData.save();
    console.log(`✓ MongoDB save complete (${Date.now() - startSave}ms)`);
    console.log(`✓ Document ID: ${savedData._id}`);

    // Step 2: PUBLISHER ROLE - Publish to RabbitMQ message broker only
    // No direct Socket.IO broadcasting - following pure pub/sub pattern
    console.log(
      "\nFLOW STEP 2: PUBLISHER sending messages to RabbitMQ broker..."
    );

    // Publish to ID-based exchange
    console.log(
      `Publishing to MARKET_DATA_EXCHANGE with key: ${savedData._id}`
    );
    const startRabbitMQ1 = Date.now();
    const publishResult1 = await rabbitmqLib.publishMarketDataUpdate(
      savedData._id.toString(),
      savedData
    );
    console.log(
      `✓ PUBLISHER sent to market data exchange: ${
        publishResult1 ? "success" : "failed"
      } (${Date.now() - startRabbitMQ1}ms)`
    );

    // Publish to type-based exchange
    console.log(
      `Publishing to MARKET_DATA_TYPE_EXCHANGE with key: ${dataType}`
    );
    const startRabbitMQ2 = Date.now();
    const publishResult2 = await rabbitmqLib.publishMarketDataTypeUpdate(
      dataType,
      savedData
    );
    console.log(
      `✓ PUBLISHER sent to market data type exchange: ${
        publishResult2 ? "success" : "failed"
      } (${Date.now() - startRabbitMQ2}ms)`
    );
    

    console.log("\n✓ Market data flow complete - response sent to client");
    console.log("---------------------------------------------------\n");

    res.status(201).json(savedData);
  } catch (err) {
    console.error("❌ ERROR in market data flow:", err.message);
    res.status(400).json({ error: err.message });
  }
});

const getCachedMarketData = async (startOfDay, endOfDay) => {
  const cacheKey = `market-data:${startOfDay.toISOString()}:${endOfDay.toISOString()}`;

  if (CACHE_ASIDE_ENABLED) {
    const cachedData = await redisClient.get(cacheKey);

    if (cachedData) {
      console.log("Cache hit");
      return JSON.parse(cachedData);
    }

    console.log("Cache miss");
  }

  const marketData = await MarketData.aggregate([
    {
      $match: { timestamp: { $lte: endOfDay } },
    },
    {
      $sort: { timestamp: -1 },
    },
    {
      $group: {
        _id: "$dataType",
        latestEntry: { $first: "$$ROOT" },
      },
    },
    {
      $replaceRoot: { newRoot: "$latestEntry" },
    },
  ]);

  if (CACHE_ASIDE_ENABLED && marketData.length > 0) {
    await redisClient.set(cacheKey, JSON.stringify(marketData), {
      EX: 3600, // Cache expires in 1 hour
    });
  }

  return marketData;
};

app.get("/market-data", async (req, res) => {
  const { day, month, year } = req.query;

  try {
    let startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    let endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    if (day && month && year) {
      const historyDay = parseInt(day, 10);
      const historyMonth = parseInt(month, 10) - 1;
      const historyYear = parseInt(year, 10);

      startOfDay = new Date(historyYear, historyMonth, historyDay, 0, 0, 0, 0);
      endOfDay = new Date(
        historyYear,
        historyMonth,
        historyDay,
        23,
        59,
        59,
        999
      );
    }

    const marketData = await getCachedMarketData(startOfDay, endOfDay);

    if (marketData.length === 0) {
      return res.status(404).json({
        message: "No market data found for the specified or nearest day",
      });
    }

    res.status(200).json(marketData);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Add a new endpoint to get ALL market data entries without grouping
app.get("/market-data/all", async (req, res) => {
  const { day, month, year, type } = req.query;

  try {
    let query = {};
    let cacheKey = "market-data:all";

    // Apply date filters if provided
    if (day && month && year) {
      const historyDay = parseInt(day, 10);
      const historyMonth = parseInt(month, 10) - 1;
      const historyYear = parseInt(year, 10);

      const startOfDay = new Date(
        historyYear,
        historyMonth,
        historyDay,
        0,
        0,
        0,
        0
      );
      const endOfDay = new Date(
        historyYear,
        historyMonth,
        historyDay,
        23,
        59,
        59,
        999
      );

      query.timestamp = { $gte: startOfDay, $lte: endOfDay };
      cacheKey += `:${startOfDay.toISOString()}:${endOfDay.toISOString()}`;
    }

    // Apply type filter if provided
    if (type) {
      query.dataType = type;
      cacheKey += `:type:${type}`;
    }

    if (CACHE_ASIDE_ENABLED) {
      const cachedData = await redisClient.get(cacheKey);

      if (cachedData) {
        console.log("Cache hit for /market-data/all");
        return res.status(200).json(JSON.parse(cachedData));
      }

      console.log("Cache miss for /market-data/all");
    }

    // Get all market data entries, sorted by timestamp (newest first)
    const allMarketData = await MarketData.find(query)
      .sort({ timestamp: -1 })
      .limit(1000); // Limit to prevent excessive data transfer

    if (CACHE_ASIDE_ENABLED && allMarketData.length > 0) {
      await redisClient.set(cacheKey, JSON.stringify(allMarketData), {
        EX: 3600, // Cache expires in 1 hour
      });
    }

    res.status(200).json(allMarketData);
  } catch (err) {
    console.error("Error fetching all market data:", err);
    res.status(400).json({ error: err.message });
  }
});

app.delete("/market-data/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const deletedData = await MarketData.findByIdAndDelete(id);

    if (!deletedData) {
      return res.status(404).json({ message: "Market data not found" });
    }

    // Invalidate or update the cache
    if (CACHE_ASIDE_ENABLED) {
      console.log("Invalidating cache due to deletion...");
      const startOfDay = new Date(deletedData.timestamp);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(deletedData.timestamp);
      endOfDay.setHours(23, 59, 59, 999);

      const cacheKey = `market-data:${startOfDay.toISOString()}:${endOfDay.toISOString()}`;
      await redisClient.del(cacheKey);
      console.log(`Cache invalidated for key: ${cacheKey}`);
    }

    // PUBLISHER ROLE - Publish deletion event to RabbitMQ
    console.log(
      "\n------- MARKET DATA DELETION: PUBLISHING TO RABBITMQ -------"
    );
    console.log(`Publishing deletion event for ID: ${id}`);
    const deletionEvent = {
      deleted: true,
      id,
      dataType: deletedData.dataType,
    };

    // Publish to ID-based exchange
    const publishResult1 = await rabbitmqLib.publishMarketDataUpdate(
      id,
      deletionEvent
    );
    console.log(
      `✓ PUBLISHER sent deletion event to market data exchange: ${
        publishResult1 ? "success" : "failed"
      }`
    );

    // Publish to type-based exchange to notify type subscribers
    const publishResult2 = await rabbitmqLib.publishMarketDataTypeUpdate(
      deletedData.dataType,
      {
        type: deletedData.dataType,
        deleted: true,
        item: { _id: id, dataType: deletedData.dataType },
      }
    );
    console.log(
      `✓ PUBLISHER sent deletion event to market data type exchange: ${
        publishResult2 ? "success" : "failed"
      }`
    );
    console.log("---------------------------------------------------\n");

    res.status(200).json({
      message: "Market data deleted successfully",
      deletedData,
    });
  } catch (err) {
    console.error("Error deleting market data:", err);
    res.status(500).json({ error: err.message });
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
app.use(express.static(path.join(__dirname, "public")));

// Replace with startup function that initializes everything in the correct order
async function startServer() {
  try {
    // Connect to MongoDB (already done via mongoConnect())
    // We don't need to connect to Redis here, as it's already connected above
    // await redisConnect(); - REMOVED THIS LINE to avoid duplicate connections

    // Connect to RabbitMQ
    await rabbitmqLib.connect();

    // After RabbitMQ is connected, set up consumers
    setupRabbitMQConsumers();

    // Start Express server
    server.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  } catch (err) {
    console.error("Error starting server:", err);
  }
}

// Function to set up RabbitMQ consumers
function setupRabbitMQConsumers() {
  // SUBSCRIBER ROLE - Subscribe to market data updates by ID
  rabbitmqLib.subscribeToMarketDataUpdates((id, messageContent) => {
    console.log("\n------- SUBSCRIBER ROLE: ID-BASED MESSAGE RECEIVED -------");
    console.log(
      `SUBSCRIBER received message from MARKET_DATA_EXCHANGE with routing key: ${id}`
    );

    try {
      // Parse the message if it's a string
      const startParse = Date.now();
      const data =
        typeof messageContent === "string"
          ? JSON.parse(messageContent)
          : messageContent;
      console.log(
        `✓ SUBSCRIBER parsed message content (${Date.now() - startParse}ms)`
      );
      console.log(
        `✓ Message data: ${JSON.stringify(data).substring(0, 150)}...`
      );

      // Forward to Socket.IO clients - SUBSCRIBER becomes a PUBLISHER to Socket.IO
      console.log(
        `FLOW STEP: MESSAGE BROKER → SUBSCRIBER → Socket.IO (ID-based routing)`
      );
      console.log(
        `SUBSCRIBER checking for active Socket.IO clients subscribed to ID: ${id}`
      );

      if (activeConnections.has(id)) {
        const clients = activeConnections.get(id);
        console.log(
          `✓ Found ${clients.size} Socket.IO client(s) subscribed to ID: ${id}`
        );

        const startBroadcast = Date.now();
        broadcastUpdate(id, JSON.stringify(data));
        console.log(
          `✓ SUBSCRIBER forwarded message to ${
            clients.size
          } Socket.IO client(s) (${Date.now() - startBroadcast}ms)`
        );
      } else {
        console.log(`ℹ No Socket.IO clients subscribed to ID: ${id}`);
      }

      console.log(`------- END OF SUBSCRIBER FLOW (ID-BASED) -------\n`);
    } catch (err) {
      console.error("❌ Error processing message:", err);
      console.error(
        `Original message content: ${messageContent.substring(0, 150)}...`
      );
    }
  });

  // SUBSCRIBER ROLE - Subscribe to market data updates by type
  rabbitmqLib.subscribeToMarketDataTypeUpdates((dataType, messageContent) => {
    console.log(
      "\n------- SUBSCRIBER ROLE: TYPE-BASED MESSAGE RECEIVED -------"
    );
    console.log(
      `SUBSCRIBER received message from MARKET_DATA_TYPE_EXCHANGE with routing key: ${dataType}`
    );

    try {
      // Parse the message if it's a string
      const startParse = Date.now();
      const data =
        typeof messageContent === "string"
          ? JSON.parse(messageContent)
          : messageContent;
      console.log(
        `✓ SUBSCRIBER parsed message content (${Date.now() - startParse}ms)`
      );
      console.log(`✓ Message type: ${data.type}`);

      if (data.item) {
        console.log(
          `✓ Single item update for ${dataType}, ID: ${data.item._id}`
        );
      } else if (data.items) {
        console.log(
          `✓ Bulk update with ${data.items.length} items for ${dataType}`
        );
      }

      // Forward to Socket.IO clients - SUBSCRIBER becomes a PUBLISHER to Socket.IO
      console.log(
        `FLOW STEP: MESSAGE BROKER → SUBSCRIBER → Socket.IO (type-based routing)`
      );
      console.log(
        `SUBSCRIBER checking for active Socket.IO clients subscribed to type: ${dataType}`
      );

      if (activeConnections.has(dataType)) {
        const clients = activeConnections.get(dataType);
        console.log(
          `✓ Found ${clients.size} Socket.IO client(s) subscribed to type: ${dataType}`
        );

        const startBroadcast = Date.now();
        clients.forEach((socketId) => {
          io.to(socketId).emit("type_update", JSON.stringify(data));
        });
        console.log(
          `✓ SUBSCRIBER forwarded message to ${
            clients.size
          } Socket.IO client(s) (${Date.now() - startBroadcast}ms)`
        );
      } else {
        console.log(`ℹ No Socket.IO clients subscribed to type: ${dataType}`);
      }

      console.log(`------- END OF SUBSCRIBER FLOW (TYPE-BASED) -------\n`);
    } catch (err) {
      console.error("❌ Error parsing message:", err);
      console.error(
        `Original message content: ${messageContent.substring(0, 150)}...`
      );
    }
  });

  console.log("✓ RabbitMQ SUBSCRIBERS set up successfully");
}

// Start the server
startServer();
