"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PriceChart } from "@/components/price-chart";
import { PriceTable } from "@/components/price-table";
import { PriceDisplay } from "@/components/price-display";
import { MarketStatus } from "@/components/market-status";
import {
  generateHistoricalData,
  simulateRealTimePrice,
} from "@/lib/price-simulator";
import type { GoldPriceData } from "@/lib/types";

export default function GoldPriceUpdater() {
  const [currentPrice, setCurrentPrice] = useState<number>(1950.75);
  const [previousPrice, setPreviousPrice] = useState<number>(1950.75);
  const [historicalData, setHistoricalData] = useState<GoldPriceData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [timeframe, setTimeframe] = useState<string>("24h");

  useEffect(() => {
    // Generate initial historical data
    const initialData = generateHistoricalData(timeframe);
    setHistoricalData(initialData);
    setCurrentPrice(initialData[initialData.length - 1].price);
    setPreviousPrice(initialData[initialData.length - 2].price);
    setIsLoading(false);

    // Set up interval for price updates
    const interval = setInterval(() => {
      setPreviousPrice(currentPrice);
      const newPrice = simulateRealTimePrice(currentPrice);
      setCurrentPrice(newPrice);

      // Add new price to historical data
      const newDataPoint = {
        timestamp: new Date(),
        price: newPrice,
      };

      setHistoricalData((prevData) => {
        const newData = [...prevData, newDataPoint];
        // Keep only the last 100 data points for performance
        if (newData.length > 100) {
          return newData.slice(newData.length - 100);
        }
        return newData;
      });
    }, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, [timeframe]);

  const handleTimeframeChange = (value: string) => {
    setIsLoading(true);
    setTimeframe(value);
    const newData = generateHistoricalData(value);
    setHistoricalData(newData);
    setCurrentPrice(newData[newData.length - 1].price);
    setPreviousPrice(newData[newData.length - 2].price);
    setIsLoading(false);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-amber-900 mb-2">GoldTrack</h1>
        <p className="text-amber-800">
          Real-time gold price updates and historical data
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle>Gold Price Chart</CardTitle>
            <CardDescription>Live updates every 5 seconds</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="24h" onValueChange={handleTimeframeChange}>
              <TabsList className="mb-4">
                <TabsTrigger value="1h">1H</TabsTrigger>
                <TabsTrigger value="24h">24H</TabsTrigger>
                <TabsTrigger value="7d">7D</TabsTrigger>
                <TabsTrigger value="30d">30D</TabsTrigger>
              </TabsList>
              <div className="h-[300px]">
                {isLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-700"></div>
                  </div>
                ) : (
                  <PriceChart data={historicalData} timeframe={timeframe} />
                )}
              </div>
            </Tabs>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Current Gold Price</CardTitle>
            <CardDescription>
              <MarketStatus />
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PriceDisplay
              currentPrice={currentPrice}
              previousPrice={previousPrice}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Historical Price Data</CardTitle>
          <CardDescription>Recent price movements</CardDescription>
        </CardHeader>
        <CardContent>
          <PriceTable data={historicalData.slice(-10).reverse()} />
        </CardContent>
      </Card>
    </div>
  );
}
