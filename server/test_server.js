const axios = require("axios");
const io = require("socket.io-client");

const SERVER_URL = "http://localhost:8080";
const MAX_CLIENTS = 30;
const CLIENT_CREATION_INTERVAL_IN_MS = 1000;
const POST_INTERVAL_IN_MS = 5000;

let clientCount = 0;
let firstReceivedTimes = [];
let updateLatencies = [];
let postTimestamps = [];
let postIntervalId = null; // Biến để lưu ID của setInterval POST

const createClient = () => {
  const transports = ["websocket"];
  const socket = io(SERVER_URL, { transports });
  let subscribeStartTime;

  socket.on("connect", () => {
    console.log(`Client connected with ID: ${socket.id}`);
    console.log(`Client ${socket.id} subscribed to PNJ`);
    subscribeStartTime = Date.now();
    socket.emit("subscribe", "PNJ");
  });

  

  let firstReceived = false;

  socket.on("type_update", (data) => {
    const update = JSON.parse(data);
    console.log(`Client ${socket.id} received type_update: ok`);

    const currentTime = Date.now();

    // Tính thời gian nhận thông tin đầu tiên sau khi subscribe
    if (!firstReceived) {
      const firstReceivedTime = currentTime - subscribeStartTime;
      firstReceivedTimes.push(firstReceivedTime);
      console.log(
        `Client ${socket.id} first received time: ${firstReceivedTime} ms`
      );
      firstReceived = true;
    }

    // Tính thời gian nhận thông tin sau mỗi POST
    if (postTimestamps.length > 0) {
      const lastPostTime = postTimestamps[postTimestamps.length - 1];
      const latency = currentTime - lastPostTime;
      updateLatencies.push(latency);
      console.log(
        `Client ${socket.id} latency for update after POST (${lastPostTime}): ${latency} ms`
      );
    }
  });

  socket.on("disconnect", (reason) => {
    console.log(`Client ${socket.id} disconnected due to ${reason}`);
  });

  // Tạo client tiếp theo nếu chưa đạt MAX_CLIENTS
  if (++clientCount < MAX_CLIENTS) {
    setTimeout(createClient, CLIENT_CREATION_INTERVAL_IN_MS);
  }
};

// Hàm thực hiện POST request định kỳ
const startPosting = () => {
  postIntervalId = setInterval(async () => {
    try {
      console.log("Starting POST request...");
      const postTime = Date.now();
      postTimestamps.push(postTime);

      const randomPrice = Math.floor(Math.random() * 100000) + 100000;

      const response = await axios.post(`${SERVER_URL}/market-data`, {
        dataType: "PNJ",
        dataPrice: randomPrice,
        timestamp: new Date(),
      });

      console.log(`POST request successful at ${postTime}:`, response.data);
    } catch (err) {
      console.error("Error during POST request:", err.message);
    }
  }, POST_INTERVAL_IN_MS);
};

// Tính toán trung bình sau 60 giây và dừng POST
setTimeout(() => {
  // Dừng POST request
  if (postIntervalId) {
    clearInterval(postIntervalId);
    console.log("Stopped POST requests.");
  }

  // Tính toán thời gian nhận thông tin đầu tiên
  if (firstReceivedTimes.length > 0) {
    const averageFirstReceivedTime =
      firstReceivedTimes.reduce((sum, time) => sum + time, 0) /
      firstReceivedTimes.length;
    console.log(
      `Average first received time: ${averageFirstReceivedTime.toFixed(2)} ms`
    );
    console.log("Total clients received first:", firstReceivedTimes.length);
  } else {
    console.log("No first received times recorded.");
  }

  // Tính toán độ trễ cập nhật sau POST
  if (updateLatencies.length > 0) {
    const averageUpdateLatency =
      updateLatencies.reduce((sum, latency) => sum + latency, 0) /
      updateLatencies.length;
    console.log(
      `Average latency for updates after POST: ${averageUpdateLatency.toFixed(
        2
      )} ms`
    );
    console.log("Total updates received after POST:", updateLatencies.length);
  } else {
    console.log("No update latencies recorded.");
  }
}, 300000);

createClient();
startPosting();