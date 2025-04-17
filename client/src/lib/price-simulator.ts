import type { GoldPriceData } from "./types";

// Base price for gold in USD
const BASE_PRICE = 1950.75;

// Generate random price with small variations
export function simulateRealTimePrice(currentPrice: number): number {
  // Random fluctuation between -0.5% and +0.5%
  const fluctuation = (Math.random() - 0.5) * 0.01;
  const newPrice = currentPrice * (1 + fluctuation);

  // Ensure price stays within reasonable bounds
  return Math.max(Math.min(newPrice, 2100), 1800);
}

// Generate historical data for different timeframes
export function generateHistoricalData(timeframe: string): GoldPriceData[] {
  const now = new Date();
  const data: GoldPriceData[] = [];

  let dataPoints = 0;
  let timeInterval = 0;
  let volatility = 0;

  // Set parameters based on timeframe
  switch (timeframe) {
    case "1h":
      dataPoints = 60;
      timeInterval = 60 * 1000; // 1 minute
      volatility = 0.0005;
      break;
    case "24h":
      dataPoints = 96;
      timeInterval = 15 * 60 * 1000; // 15 minutes
      volatility = 0.001;
      break;
    case "7d":
      dataPoints = 84;
      timeInterval = 2 * 60 * 60 * 1000; // 2 hours
      volatility = 0.003;
      break;
    case "30d":
      dataPoints = 90;
      timeInterval = 8 * 60 * 60 * 1000; // 8 hours
      volatility = 0.005;
      break;
    default:
      dataPoints = 96;
      timeInterval = 15 * 60 * 1000; // 15 minutes
      volatility = 0.001;
  }

  // Generate data points
  let price = BASE_PRICE;
  for (let i = 0; i < dataPoints; i++) {
    const timestamp = new Date(now.getTime() - (dataPoints - i) * timeInterval);

    // Add some randomness to the price
    const change = (Math.random() - 0.5) * 2 * volatility;
    price = price * (1 + change);

    // Add some trends based on time of day
    const hour = timestamp.getHours();
    if (hour >= 9 && hour <= 11) {
      // Morning uptrend
      price *= 1.0005;
    } else if (hour >= 15 && hour <= 17) {
      // Afternoon volatility
      price *= 1 + (Math.random() - 0.5) * 0.001;
    }

    data.push({
      timestamp,
      price,
    });
  }

  return data;
}
