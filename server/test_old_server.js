const axios = require("axios");
require("dotenv").config()

const SERVER_URL = process.env.URL_ENDPOINT;
const TEST_DURATION = 2 * 60 * 1000; // 7 minutes in milliseconds
const MAX_CLIENTS = 30;
const CLIENT_INTERVAL = 1000; // 1 second
const GET_INTERVAL = 2000; // 2 seconds
const POST_INTERVAL = 5000; // 5 seconds

let clients = [];
let postTimestamps = [];
let latencyData = [];

// Function to create a new client
const createClient = (id) => {
  const client = {
    id,
    intervalId: null,
    lastPostId: null,
  };

  // Start GET requests every 2 seconds
  client.intervalId = setInterval(async () => {
    try {
      const response = await axios.get(`${SERVER_URL}/market-data`)
      const data = response.data;

      // Check for new data and calculate latency
      if (data.length > 0) {
        const latestData = data[0];
        const postId = latestData._id;
        const postTime = new Date(latestData.timestamp).getTime();

        if (client.lastPostId !== postId) {
          client.lastPostId = postId;
          const now = Date.now();
          const latency = now - postTime;

          console.log(`Client ${id} received new data from post ${postId}. Latency: ${latency}ms`);
          latencyData.push(latency);
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
  setInterval(async () => {
    const randomPrice = Math.random() * 100; // Tạo giá trị dataPrice ngẫu nhiên

    const postData = {
      dataType: "PNJ", // Giữ nguyên dataType là "PNJ"
      dataPrice: randomPrice, // Thay đổi giá trị dataPrice
      timestamp: new Date(), // Thời gian hiện tại
    };

    try {
      const response = await axios.post(`${SERVER_URL}/market-data`, postData);
      const postId = response.data._id;
      const postTime = new Date(response.data.timestamp).getTime();

      console.log(`Posted new data with ID ${postId} at ${postTime}`);
      postTimestamps.push({ postId, postTime });
    } catch (err) {
      console.error("POST error:", err.message);
    }
  }, POST_INTERVAL);
};

// Start creating clients every 1 second until reaching 300 clients
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
  clients.forEach((client) => clearInterval(client.intervalId));

  const totalLatency = latencyData.reduce((sum, latency) => sum + latency, 0);
  const averageLatency = latencyData.length > 0 ? totalLatency / latencyData.length : 0;

  console.log("Test completed.");
  console.log(`Total latency data points: ${latencyData.length}`);
  console.log(`Average latency: ${averageLatency.toFixed(2)}ms`);
};

// Start the test
console.log("Starting performance test...");
startClients();
startPosting();

// Stop the test after 7 minutes
setTimeout(stopTest, TEST_DURATION);