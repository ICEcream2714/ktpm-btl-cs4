/**
 * RabbitMQ Message Broker Integration
 *
 * This module implements the pub/sub (Publisher/Subscriber) pattern using RabbitMQ as the message broker.
 *
 * PUBLISHER: Any component that calls the publishMarketDataUpdate or publishMarketDataTypeUpdate functions
 * - Publishers are decoupled from subscribers and don't need to know who receives their messages
 * - Example: The HTTP POST /market-data endpoint that receives market data
 *
 * MESSAGE BROKER: RabbitMQ server that handles message routing
 * - Manages exchanges (market_data and market_data_type)
 * - Manages queues (market_data_updates and market_data_type_updates)
 * - Routes messages from publishers to appropriate subscribers
 * - Provides message persistence and delivery guarantees
 *
 * SUBSCRIBER: Any component that calls subscribeToMarketDataUpdates or subscribeToMarketDataTypeUpdates
 * - Receives messages from the broker without knowing about publishers
 * - Example: The RabbitMQ consumer in server.js that forwards messages to Socket.IO clients
 */

const amqp = require("amqplib");

// RabbitMQ connection details from docker-compose
const RABBITMQ_URL =
  process.env.RABBITMQ_URL || "amqp://user:password@localhost:5672";

// Exchange names
const MARKET_DATA_EXCHANGE = "market_data";
const MARKET_DATA_TYPE_EXCHANGE = "market_data_type";

// Queue names
const MARKET_DATA_QUEUE = "market_data_updates";
const MARKET_DATA_TYPE_QUEUE = "market_data_type_updates";

// Connection variables
let connection = null;
let channel = null;
let connectionRetryTimeout = null;

/**
 * Connect to RabbitMQ and setup exchanges and queues
 * This initializes the message broker connection and configures the message routing infrastructure
 */
async function connect() {
  try {
    console.log("[MESSAGE BROKER] Connecting to RabbitMQ...");

    // Create connection
    connection = await amqp.connect(RABBITMQ_URL);
    console.log("[MESSAGE BROKER] Connected to RabbitMQ");

    // Handle connection closing
    connection.on("close", (err) => {
      console.error("[MESSAGE BROKER] RabbitMQ connection closed", err);
      scheduleReconnect();
    });

    connection.on("error", (err) => {
      console.error("[MESSAGE BROKER] RabbitMQ connection error", err);
      if (!connection) scheduleReconnect();
    });

    // Create channel
    channel = await connection.createChannel();
    console.log("[MESSAGE BROKER] RabbitMQ channel created");

    // Setup exchanges - these are the routing mechanisms for publishers
    // Sử dụng topic exchange thay vì direct để hỗ trợ định tuyến linh hoạt với wildcard
    await channel.assertExchange(MARKET_DATA_EXCHANGE, "topic", {
      durable: true,
    });
    await channel.assertExchange(MARKET_DATA_TYPE_EXCHANGE, "topic", {
      durable: true,
    });
    console.log("[MESSAGE BROKER] RabbitMQ exchanges created");

    // Setup queues - these store messages for subscribers
    await channel.assertQueue(MARKET_DATA_QUEUE, { durable: true });
    await channel.assertQueue(MARKET_DATA_TYPE_QUEUE, { durable: true });
    console.log("[MESSAGE BROKER] RabbitMQ queues created");

    // Bind queues to exchanges - defines the routing rules
    // Sử dụng # làm wildcard để nhận tất cả tin nhắn, bất kể routing key
    await channel.bindQueue(MARKET_DATA_QUEUE, MARKET_DATA_EXCHANGE, "#");
    await channel.bindQueue(
      MARKET_DATA_TYPE_QUEUE,
      MARKET_DATA_TYPE_EXCHANGE,
      "#"
    );
    console.log("[MESSAGE BROKER] RabbitMQ queues bound to exchanges");

    return { connection, channel };
  } catch (error) {
    console.error("[MESSAGE BROKER] Failed to connect to RabbitMQ", error);
    scheduleReconnect();
    return null;
  }
}

/**
 * Schedule a reconnection attempt
 */
function scheduleReconnect() {
  if (connectionRetryTimeout) {
    clearTimeout(connectionRetryTimeout);
  }

  connectionRetryTimeout = setTimeout(() => {
    console.log("Attempting to reconnect to RabbitMQ...");
    connect();
  }, 5000);
}

/**
 * PUBLISHER INTERFACE
 * Publish a message to the market data exchange
 * @param {string} key - The routing key (market data ID)
 * @param {Object} data - The message payload
 */
async function publishMarketDataUpdate(key, data) {
  if (!channel) {
    console.warn(
      "[PUBLISHER] Cannot publish to RabbitMQ: Channel not available"
    );
    return false;
  }

  try {
    console.log(`[PUBLISHER] Publishing to ${MARKET_DATA_EXCHANGE}:`);
    console.log(`[PUBLISHER] - Routing key: ${key}`);
    console.log(
      `[PUBLISHER] - Message size: ${JSON.stringify(data).length} bytes`
    );

    const success = channel.publish(
      MARKET_DATA_EXCHANGE,
      key,
      Buffer.from(typeof data === "string" ? data : JSON.stringify(data)),
      { persistent: true }
    );

    console.log(
      `[PUBLISHER] - Publish result: ${success ? "success" : "failed"}`
    );
    return success;
  } catch (error) {
    console.error("[PUBLISHER] Failed to publish to RabbitMQ:", error);
    return false;
  }
}

/**
 * PUBLISHER INTERFACE
 * Publish a message to the market data type exchange
 * @param {string} dataType - The data type (e.g., "BTC_USD")
 * @param {Object} data - The message payload
 */
async function publishMarketDataTypeUpdate(dataType, data) {
  if (!channel) {
    console.warn(
      "[PUBLISHER] Cannot publish to RabbitMQ: Channel not available"
    );
    return false;
  }

  try {
    // Format the message according to what the client expects
    // Client expects an object with {type: string, item?: object, items?: object[]}
    const updateMessage = {
      type: dataType,
      item: data, // This is a single item update
    };

    console.log(`\n[PUBLISHER] Publishing to ${MARKET_DATA_TYPE_EXCHANGE}:`);
    console.log(`[PUBLISHER] - Routing key: ${dataType}`);
    console.log(`[PUBLISHER] - Message type: ${dataType}`);
    console.log(
      `[PUBLISHER] - Message size: ${
        JSON.stringify(updateMessage).length
      } bytes`
    );

    const messageBuffer = Buffer.from(JSON.stringify(updateMessage));

    const success = channel.publish(
      MARKET_DATA_TYPE_EXCHANGE,
      dataType,
      messageBuffer,
      { persistent: true }
    );

    console.log(
      `[PUBLISHER] - Publish result: ${success ? "success" : "failed"}`
    );
    return success;
  } catch (error) {
    console.error("[PUBLISHER] Failed to publish to RabbitMQ:", error);
    return false;
  }
}

/**
 * SUBSCRIBER INTERFACE
 * Subscribe to market data updates
 * @param {Function} callback - Callback function to handle received messages
 */
async function subscribeToMarketDataUpdates(callback) {
  if (!channel) {
    console.warn(
      "[SUBSCRIBER] Cannot subscribe to RabbitMQ: Channel not available"
    );
    return;
  }

  console.log(
    `\n[SUBSCRIBER] Setting up consumer for queue: ${MARKET_DATA_QUEUE}`
  );

  await channel.consume(MARKET_DATA_QUEUE, (message) => {
    if (message) {
      try {
        console.log(
          `\n[SUBSCRIBER] Message received from ${MARKET_DATA_QUEUE}`
        );
        console.log(`[SUBSCRIBER] - Routing key: ${message.fields.routingKey}`);
        console.log(`[SUBSCRIBER] - Exchange: ${message.fields.exchange}`);
        console.log(
          `[SUBSCRIBER] - Message size: ${message.content.length} bytes`
        );

        const content = message.content.toString();
        const routingKey = message.fields.routingKey;

        callback(routingKey, content);
        channel.ack(message);
        console.log(`[SUBSCRIBER] - Message acknowledged`);
      } catch (error) {
        console.error("[SUBSCRIBER] Error processing message:", error);
        channel.nack(message);
        console.error("[SUBSCRIBER] - Message rejected (nack)");
      }
    }
  });

  console.log(
    `[SUBSCRIBER] Successfully subscribed to market data updates via ${MARKET_DATA_QUEUE}`
  );
}

/**
 * SUBSCRIBER INTERFACE
 * Subscribe to market data type updates
 * @param {Function} callback - Callback function to handle received messages
 */
async function subscribeToMarketDataTypeUpdates(callback) {
  if (!channel) {
    console.warn(
      "[SUBSCRIBER] Cannot subscribe to RabbitMQ: Channel not available"
    );
    return;
  }

  console.log(
    `\n[SUBSCRIBER] Setting up consumer for queue: ${MARKET_DATA_TYPE_QUEUE}`
  );

  await channel.consume(MARKET_DATA_TYPE_QUEUE, (message) => {
    if (message) {
      try {
        console.log(
          `\n[SUBSCRIBER] Message received from ${MARKET_DATA_TYPE_QUEUE}`
        );
        console.log(`[SUBSCRIBER] - Routing key: ${message.fields.routingKey}`);
        console.log(`[SUBSCRIBER] - Exchange: ${message.fields.exchange}`);
        console.log(
          `[SUBSCRIBER] - Message size: ${message.content.length} bytes`
        );

        const content = message.content.toString();
        const routingKey = message.fields.routingKey;

        callback(routingKey, content);
        channel.ack(message);
        console.log(`[SUBSCRIBER] - Message acknowledged`);
      } catch (error) {
        console.error("[SUBSCRIBER] Error processing message:", error);
        channel.nack(message);
        console.error("[SUBSCRIBER] - Message rejected (nack)");
      }
    }
  });

  console.log(
    `[SUBSCRIBER] Successfully subscribed to market data type updates via ${MARKET_DATA_TYPE_QUEUE}`
  );
}

/**
 * Close the RabbitMQ connection
 */
async function close() {
  try {
    if (channel) {
      await channel.close();
    }
    if (connection) {
      await connection.close();
    }
    console.log("RabbitMQ connection closed");
  } catch (error) {
    console.error("Error closing RabbitMQ connection", error);
  }
}

module.exports = {
  connect,
  publishMarketDataUpdate,
  publishMarketDataTypeUpdate,
  subscribeToMarketDataUpdates,
  subscribeToMarketDataTypeUpdates,
  close,
  MARKET_DATA_EXCHANGE,
  MARKET_DATA_TYPE_EXCHANGE,
};
