const axios = require("axios"); // Thêm axios để thực hiện POST request
const io = require("socket.io-client"); // Thêm socket.io-client để tạo client

const SERVER_URL = "http://localhost:8080"; // URL của server
const MAX_CLIENTS = 30; // Số lượng client tối đa
const CLIENT_CREATION_INTERVAL_IN_MS = 1000; // Khoảng thời gian tạo client mới (ms)
const EMIT_INTERVAL_IN_MS = 2000; // Khoảng thời gian gửi sự kiện từ client (ms)

let calculate = false; // Biến kiểm soát việc tính toán
let latencies = []; // Mảng lưu trữ thời gian trễ
let startTime = 0; // Thời gian bắt đầu POST request
let clientCount = 0; // Số lượng client hiện tại
let clientFirstReceived = 0; // Số lượng client đã nhận được thông báo đầu tiên

const createClient = () => {
  const transports = ["websocket"];
  const socket = io(SERVER_URL, { transports });

  setInterval(() => {
    socket.emit("client to server event");
  }, EMIT_INTERVAL_IN_MS);

  socket.on("disconnect", (reason) => {
    console.log(`disconnect due to ${reason}`);
  });

  socket.emit("subscribe", "PNJ");

  socket.on("type_update", (data) => {
    const update = JSON.parse(data);
    console.log("ok");

    if (calculate) {
      const latency = Date.now() - startTime; // Tính thời gian trễ
      latencies.push(latency); // Lưu vào mảng
      console.log(`Latency for client: ${latency} ms`);
    } else {
      clientFirstReceived++;
      console.log(`Client first received count: ${clientFirstReceived}`);

      // Khi tất cả các client đã nhận được thông báo đầu tiên, thực hiện POST request
      if (clientFirstReceived === MAX_CLIENTS) {
        performPostRequest();
      }
    }
  });

  if (++clientCount < MAX_CLIENTS) {
    setTimeout(createClient, CLIENT_CREATION_INTERVAL_IN_MS);
  }
};

const performPostRequest = async () => {
  try {
    console.log("Starting POST request...");
    startTime = Date.now(); // Đánh dấu thời gian bắt đầu
    const response = await axios.post(`${SERVER_URL}/market-data`, {
      dataType: "PNJ",
      dataPrice: 123223,
      timestamp: new Date(),
    });

    console.log("POST request successful:", response.data);
    calculate = true; // Bật tính toán thời gian
  } catch (err) {
    console.error("Error during POST request:", err.message);
    process.exit(1);
  }
};

createClient();

// Tính trung bình thời gian trễ sau khi POST request hoàn tất
setTimeout(() => {
  if (latencies.length > 0) {
    const averageLatency =
      latencies.reduce((sum, latency) => sum + latency, 0) / latencies.length;
    console.log(`Average latency: ${averageLatency.toFixed(2)} ms`);
    console.log("Total clients received after post:", latencies.length);
  } else {
    console.log("No latencies recorded.");
  }
}, 80000);