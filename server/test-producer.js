// Test script to simulate market data publishers sending updates
const axios = require("axios");

console.log("\n==========================================");
console.log("MARKET DATA PUBLISHER SIMULATION");
console.log("==========================================");
console.log("This script acts as a PUBLISHER in the pub/sub pattern.");
console.log("It sends market data updates to the server API,");
console.log("which then publishes them to the RabbitMQ message broker.");
console.log("==========================================\n");

// Market data types
const DATA_TYPES = ["Gold", "Silver", "BTC_USD", "ETH_USD", "Oil_WTI"];

// Function to generate a random price change
function getRandomPriceChange() {
  // Generate a random number between -0.5% and +0.5%
  return (Math.random() - 0.5) * 0.01;
}

// Base prices for each data type
const basePrices = {
  Gold: 3250,
  Silver: 35,
  BTC_USD: 80000,
  ETH_USD: 4000,
  Oil_WTI: 75,
};

// Current prices (starting with base prices)
const currentPrices = { ...basePrices };

// Function to send a market data update
async function sendMarketDataUpdate(dataType) {
  // Calculate new price with random change
  const changePercent = getRandomPriceChange();
  const currentPrice = currentPrices[dataType];
  const priceChange = currentPrice * changePercent;
  const newPrice = currentPrice + priceChange;

  // Update the current price
  currentPrices[dataType] = newPrice;

  // Round to appropriate number of decimal places
  const dataPrice = dataType.includes("USD")
    ? newPrice.toFixed(0)
    : newPrice.toFixed(2);

  // Create the market data update
  const marketData = {
    dataType,
    dataPrice,
    timestamp: new Date().toISOString(),
  };

  try {
    console.log(`\n[PUBLISHER] Sending update for ${dataType}: ${dataPrice}`);

    // Send to the server API
    const response = await axios.post(
      "http://localhost:8080/market-data",
      marketData
    );
    console.log(
      `[PUBLISHER] Update sent successfully, ID: ${response.data._id}`
    );
    console.log(
      `[PUBLISHER] ↓ The server will now publish this to the RabbitMQ message broker ↓`
    );
  } catch (error) {
    console.error(
      `[PUBLISHER] Error sending update for ${dataType}:`,
      error.message
    );
  }
}

// Main function to run the simulation
async function runSimulation() {
  console.log("[PUBLISHER] Starting market data simulation...");
  console.log("[PUBLISHER] This will send random price updates to the server.");
  console.log("[PUBLISHER] Press Ctrl+C to stop the simulation.");

  // Send initial updates for all data types
  for (const dataType of DATA_TYPES) {
    await sendMarketDataUpdate(dataType);
  }

  // Set up intervals for each data type with different frequencies
  DATA_TYPES.forEach((dataType, index) => {
    // Different update intervals for different data types (between 3-10 seconds)
    const interval = (3 + index * 1.5) * 1000;

    setInterval(() => {
      sendMarketDataUpdate(dataType);
    }, interval);
  });
}

// Run the simulation
runSimulation();
