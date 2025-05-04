const axios = require("axios");
require("dotenv").config();

// Use a default URL if URL_ENDPOINT is not defined in .env
const SERVER_URL = process.env.URL_ENDPOINT || "http://localhost:8080";
const TEST_DURATION = 2 * 60 * 1000; // 8 minutes in milliseconds
const MAX_CLIENTS = 30;
const CLIENT_INTERVAL = 1000; // 1 second
const GET_INTERVAL = 2000; // 2 seconds
const POST_INTERVAL = 5000; // 5 seconds

let clients = [];
let postTimestamps = {}; // Store timestamps by post ID
let latencyData = [];
let receiveCount = 0; // Counter for number of receive operations
let postingIntervalId = null; // Store the interval ID for posting data

// Function to create a new client
const createClient = (id) => {
  const client = {
    id,
    intervalId: null,
    processedPostIds: new Set(), // Track which posts this client has processed
  };

  // Start GET requests every 2 seconds
  client.intervalId = setInterval(async () => {
    try {
      // Use the correct endpoint depending on the server being tested
      const response = await axios.get(`${SERVER_URL}/market-data`);
      const data = response.data;

      // Check for new data and calculate latency
      if (data && data.length > 0) {
        // Find the most recent data item
        let latestData = data[0]; // Default to first item

        // If data is an array, find the latest by timestamp
        if (Array.isArray(data)) {
          data.forEach((item) => {
            if (
              !latestData ||
              new Date(item.timestamp) > new Date(latestData.timestamp)
            ) {
              latestData = item;
            }
          });
        }

        const postId = latestData._id;

        // Only calculate latency if we posted this ID and this client hasn't processed it yet
        if (postTimestamps[postId] && !client.processedPostIds.has(postId)) {
          client.processedPostIds.add(postId); // Mark as processed for this client

          const now = Date.now();
          const postTime = postTimestamps[postId];
          const latency = now - postTime;

          console.log(
            `Client ${id} received new data from post ${postId}. Latency: ${latency}ms`
          );
          latencyData.push(latency);
          receiveCount++; // Increment receive counter
        }
      }
    } catch (err) {
      console.error(`Client ${id} GET error:`, err.message);
    }
  }, GET_INTERVAL);

  return client;
};

// Function to perform POST requests every 5 seconds
const startPosting = () => {
  postingIntervalId = setInterval(async () => {
    const randomPrice = Math.random() * 100;
    const clientTime = Date.now(); // Record time before making the request

    const postData = {
      dataType: "PNJ",
      dataPrice: randomPrice,
      timestamp: new Date(),
    };

    try {
      const response = await axios.post(`${SERVER_URL}/market-data`, postData);
      const postId = response.data._id;

      // Store the client-side timestamp when the request was made
      postTimestamps[postId] = clientTime;

      console.log(`Posted new data with ID ${postId} at ${clientTime}`);
    } catch (err) {
      console.error("POST error:", err.message);
    }
  }, POST_INTERVAL);

  return postingIntervalId; // Return the interval ID so it can be cleared later
};

// Start creating clients every 1 second until reaching MAX_CLIENTS
const startClients = () => {
  let clientCount = 0;

  const clientInterval = setInterval(() => {
    if (clientCount >= MAX_CLIENTS) {
      clearInterval(clientInterval);
      return;
    }

    const client = createClient(clientCount + 1);
    clients.push(client);
    console.log(`Client ${clientCount + 1} created.`);
    clientCount++;
  }, CLIENT_INTERVAL);
};

// Stop all clients and calculate results
const stopTest = () => {
  // Stop all client GET requests
  clients.forEach((client) => clearInterval(client.intervalId));

  // Stop the posting interval
  if (postingIntervalId) {
    clearInterval(postingIntervalId);
    console.log("Stopped posting new data.");
  }

  const totalLatency = latencyData.reduce((sum, latency) => sum + latency, 0);
  const averageLatency =
    latencyData.length > 0 ? totalLatency / latencyData.length : 0;

  // Calculate how many clients received data at least once
  const clientsWithData = clients.filter(
    (client) => client.processedPostIds.size > 0
  ).length;

  console.log("Test completed.");
  console.log(`Total number of receives: ${receiveCount}`);
  console.log(
    `Number of clients that received data: ${clientsWithData} out of ${clients.length}`
  );
  console.log(`Average latency: ${averageLatency.toFixed(2)}ms`);

  // Exit the process after printing the results
  // Give some time for any pending operations to complete
  setTimeout(() => {
    console.log("Exiting test...");
    process.exit(0);
  }, 1000);
};

// Start the test
console.log("Starting performance test...");
startClients();
startPosting();

// Stop the test after TEST_DURATION
setTimeout(stopTest, TEST_DURATION);
