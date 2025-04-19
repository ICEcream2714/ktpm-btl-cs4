"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { MarketStatus } from "@/components/market-status";
import { PriceChart } from "@/components/price-chart";
import socketManager from "@/lib/socket-manager";

// Define interface for market data structure based on your API response
interface MarketDataItem {
  _id: string;
  dataType: string;
  dataPrice: string;
  timestamp: string;
  createdAt?: string;
  updatedAt?: string;
  __v?: number;
}

export function MarketDataDashboard() {
  const [marketData, setMarketData] = useState<MarketDataItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [socketStatus, setSocketStatus] = useState<string>("disconnected");
  const [realtimeUpdates, setRealtimeUpdates] = useState<
    Record<string, boolean>
  >({});

  // Store which data types we've subscribed to
  const subscribedTypes = useRef<Set<string>>(new Set());

  // Function to fetch initial market data
  const fetchMarketData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      console.log("Fetching market data from API...");
      const response = await fetch("http://localhost:8080/market-data/all");

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();
      console.log("Received data:", data);
      setMarketData(data);

      // Select the first data type by default
      if (data.length > 0 && !selectedType) {
        setSelectedType(data[0].dataType);
      }

      // Subscribe to socket updates for each unique data type
      if (data.length > 0) {
        const dataTypes = Array.from(
          new Set(data.map((item) => item.dataType))
        );
        subscribeToDataTypes(dataTypes);
      }
    } catch (err) {
      console.error("Error fetching market data:", err);
      setError(
        `Failed to fetch market data: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    } finally {
      setIsLoading(false);
    }
  }, [selectedType]);

  // Subscribe to socket updates for data types
  const subscribeToDataTypes = useCallback((dataTypes: string[]) => {
    // Connect to socket if not already connected
    socketManager.connect();

    // Subscribe to updates for each data type
    dataTypes.forEach((dataType) => {
      // Only subscribe if we haven't already subscribed to this type
      if (!subscribedTypes.current.has(dataType)) {
        subscribedTypes.current.add(dataType);

        console.log(`Setting up subscription for data type: ${dataType}`);
        socketManager.subscribeToDataType(dataType, (items, latestItem) => {
          console.log(
            `Received real-time update for ${dataType}:`,
            latestItem || items
          );

          if (latestItem) {
            // This is a single-item update
            setMarketData((prevData) => {
              // Check if this item is already in our state
              const existingItemIndex = prevData.findIndex(
                (item) => item._id === latestItem._id
              );

              if (existingItemIndex >= 0) {
                // Update existing item
                const newData = [...prevData];
                newData[existingItemIndex] = latestItem;
                return newData;
              } else {
                // Add new item
                return [latestItem, ...prevData];
              }
            });

            // Highlight the updated item
            setRealtimeUpdates((prev) => ({ ...prev, [latestItem._id]: true }));

            // Reset the visual indicator after 3 seconds
            setTimeout(() => {
              setRealtimeUpdates((prev) => ({
                ...prev,
                [latestItem._id]: false,
              }));
            }, 3000);
          } else if (items && items.length > 0) {
            // This is an initial load or bulk update for the data type
            setMarketData((prevData) => {
              // Remove all existing items of this type
              const filteredData = prevData.filter(
                (item) => item.dataType !== dataType
              );
              // Add the new items
              return [...filteredData, ...items];
            });
          }
        });
      }
    });
  }, []);

  // Fetch data and set up socket connection on component mount
  useEffect(() => {
    fetchMarketData();

    // Set up socket status listener
    const removeStatusListener = socketManager.onStatusChange((status) => {
      setSocketStatus(status);
    });

    // Clean up on unmount
    return () => {
      removeStatusListener();

      // Unsubscribe from all socket subscriptions
      subscribedTypes.current.forEach((dataType) => {
        socketManager.unsubscribeFromDataType(dataType, () => {});
      });
      subscribedTypes.current.clear();
    };
  }, [fetchMarketData]);

  // Get unique data types and sort them alphabetically to maintain consistent order
  const dataTypes = Array.from(
    new Set(marketData.map((item) => item.dataType))
  ).sort();

  // Filter data by selected type
  const filteredData = selectedType
    ? marketData.filter((item) => item.dataType === selectedType)
    : marketData;

  return (
    <div className="container mx-auto px-4 py-8">
      {/*}
      <div className="bg-gradient-to-r from-amber-100 to-yellow-100 rounded-lg p-6 mb-8">
        <h1 className="text-3xl font-bold text-amber-900 mb-2">
          Market Data Dashboard
        </h1>
        <p className="text-amber-800">Live data from the Market Data API</p>

        {/* Socket connection indicator */}
        {/*
        <div className="mt-2 flex items-center">
          <div
            className={`w-3 h-3 rounded-full mr-2 ${
              socketStatus === "connected"
                ? "bg-green-500"
                : socketStatus === "connecting"
                ? "bg-yellow-500"
                : "bg-red-500"
            }`}
          />
          <span className="text-sm">
            {socketStatus === "connected"
              ? "Real-time connection active"
              : socketStatus === "connecting"
              ? "Connecting..."
              : "Real-time connection inactive"}
          </span>
        </div>
      </div>

      {/* Status and Refresh */}
      <div className="flex justify-between items-center mb-6">
        <MarketStatus />
        <Button
          onClick={fetchMarketData}
          disabled={isLoading}
          className="bg-amber-600 hover:bg-amber-700"
        >
          {isLoading ? "Loading..." : "Refresh Data"}
        </Button>
      </div>

      {/* Error display */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
          <p>{error}</p>
          <p className="text-sm mt-2">
            Try checking if the server is running at http://localhost:8080
          </p>
        </div>
      )}

      {/* Data type filter buttons */}
      {dataTypes.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-2">
            Filter by Market Data Type
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button
              key="all"
              variant={selectedType === null ? "default" : "outline"}
              disabled={true}
              onClick={() => setSelectedType(null)}
              className="bg-amber-500 hover:bg-amber-600"
            >
              All Types
            </Button>
            {dataTypes.map((type) => (
              <Button
                key={type}
                variant={selectedType === type ? "default" : "outline"}
                onClick={() => setSelectedType(type)}
                className={selectedType === type ? "bg-amber-600" : ""}
              >
                {type}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Featured Card for selected data type and Price Chart side by side */}
      {!isLoading && marketData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Left side: Featured Card */}
          {(() => {
            // Get the data to display - either the selected type or the first available type
            const dataTypeToShow = selectedType || dataTypes[0];
            const item = marketData.find(
              (item) => item.dataType === dataTypeToShow
            );

            if (!item) return null;

            // Determine background and styling based on data type
            let cardStyle =
              "bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200";
            let titleColor = "text-amber-700";
            let valueColor = "text-amber-700";

            if (
              item.dataType === "BTC_USD" ||
              item.dataType.includes("Bitcoin")
            ) {
              cardStyle =
                "bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200";
              titleColor = "text-orange-700";
              valueColor = "text-orange-700";
            } else if (
              item.dataType === "WTI" ||
              item.dataType === "Brent" ||
              item.dataType.includes("Oil")
            ) {
              cardStyle =
                "bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200";
              titleColor = "text-blue-700";
              valueColor = "text-blue-700";
            } else if (
              item.dataType.includes("ETH") ||
              item.dataType.includes("Ethereum")
            ) {
              cardStyle =
                "bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200";
              titleColor = "text-purple-700";
              valueColor = "text-purple-700";
            } else if (
              item.dataType === "USD" ||
              item.dataType.includes("Dollar")
            ) {
              cardStyle =
                "bg-gradient-to-br from-green-50 to-green-100 border-green-200";
              titleColor = "text-green-700";
              valueColor = "text-green-700";
            }

            const isNumber = !isNaN(parseFloat(item.dataPrice));
            const formattedValue = isNumber
              ? `$${parseFloat(item.dataPrice).toLocaleString(undefined, {
                  minimumFractionDigits:
                    item.dataType.includes("BTC") ||
                    item.dataType.includes("ETH")
                      ? 0
                      : 2,
                  maximumFractionDigits:
                    item.dataType.includes("BTC") ||
                    item.dataType.includes("ETH")
                      ? 0
                      : 2,
                })}`
              : item.dataPrice;

            return (
              <Card
                key={item._id}
                className={`${cardStyle} ${
                  realtimeUpdates[item._id]
                    ? "shadow-lg shadow-amber-300 transition-all"
                    : ""
                }`}
              >
                <CardHeader className="pb-2">
                  <CardTitle
                    className={`flex items-center text-2xl ${titleColor}`}
                  >
                    {item.dataType} Price
                    {realtimeUpdates[item._id] && (
                      <span className="ml-2 px-2 py-0.5 text-xs bg-green-100 text-green-800 rounded-full animate-pulse">
                        Updated
                      </span>
                    )}
                  </CardTitle>
                  <CardDescription className="text-base">
                    Latest market value
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className={`text-5xl font-bold ${valueColor}`}>
                    {formattedValue}
                  </div>
                  <div className="text-sm text-gray-500 mt-3">
                    Updated: {new Date(item.timestamp).toLocaleString()}
                  </div>

                  {socketStatus === "connected" ? (
                    <div className="mt-3 text-sm flex items-center text-green-700">
                      <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                      Real-time updates active
                    </div>
                  ) : (
                    <div className="mt-3 text-sm flex items-center text-gray-500">
                      <div className="w-2 h-2 bg-red-500 rounded-full mr-2"></div>
                      Real-time updates inactive
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          {/* Right side: Price Chart */}
          {(() => {
            const dataTypeToShow = selectedType || dataTypes[0];
            const typeData = marketData.filter(
              (item) => item.dataType === dataTypeToShow
            );

            if (typeData.length === 0) return null;

            // Convert market data to the format expected by the PriceChart component
            const chartData = typeData
              .sort(
                (a, b) =>
                  new Date(a.timestamp).getTime() -
                  new Date(b.timestamp).getTime()
              )
              .map((item) => ({
                timestamp: new Date(item.timestamp),
                price: parseFloat(item.dataPrice),
              }));

            const cardStyle =
              dataTypeToShow === "BTC_USD" || dataTypeToShow.includes("Bitcoin")
                ? "border-orange-200"
                : dataTypeToShow === "WTI" ||
                  dataTypeToShow === "Brent" ||
                  dataTypeToShow.includes("Oil")
                ? "border-blue-200"
                : dataTypeToShow.includes("ETH") ||
                  dataTypeToShow.includes("Ethereum")
                ? "border-purple-200"
                : dataTypeToShow === "USD" || dataTypeToShow.includes("Dollar")
                ? "border-green-200"
                : "border-amber-200";

            return (
              <Card className={cardStyle}>
                <CardHeader className="pb-2">
                  <CardTitle>{dataTypeToShow} Price History</CardTitle>
                  <CardDescription>Historical price data</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="px-6 pt-0 pb-6">
                    <div className="h-[250px]">
                      {chartData.length > 1 ? (
                        <PriceChart data={chartData} timeframe="all" />
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <p className="text-muted-foreground">
                            Not enough data for chart
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })()}
        </div>
      )}

      {/* Market Data Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            Market Data {selectedType ? `- ${selectedType}` : ""}
          </CardTitle>
          <CardDescription>
            {selectedType
              ? `Showing data for ${selectedType}`
              : "Showing all market data types"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center p-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-700"></div>
            </div>
          ) : filteredData.length === 0 ? (
            <p className="text-center py-8">No market data available</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data Type</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Last Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.map((item) => (
                    <TableRow
                      key={item._id}
                      className={
                        realtimeUpdates[item._id]
                          ? "bg-green-50 animate-pulse"
                          : ""
                      }
                    >
                      <TableCell className="font-medium">
                        {item.dataType}
                      </TableCell>
                      <TableCell>
                        {item.dataType.includes("USD") ||
                        item.dataType === "BTC_USD" ||
                        item.dataType === "ETH_USD"
                          ? `$${parseFloat(item.dataPrice).toLocaleString()}`
                          : item.dataPrice}
                      </TableCell>
                      <TableCell>
                        {new Date(item.timestamp).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {item.updatedAt
                          ? new Date(item.updatedAt).toLocaleString()
                          : "N/A"}
                        {realtimeUpdates[item._id] && (
                          <span className="ml-2 px-2 py-0.5 text-xs bg-green-100 text-green-800 rounded-full">
                            Live
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Debug Info - Only visible during development */}
      {/* {process.env.NODE_ENV !== "production" && (
        <div className="mt-8 p-4 border border-gray-200 rounded bg-gray-50">
          <h3 className="font-semibold mb-2">Socket Connection Status</h3>
          <p>
            Connection:{" "}
            <span
              className={
                socketStatus === "connected"
                  ? "text-green-600 font-bold"
                  : socketStatus === "connecting"
                  ? "text-yellow-600 font-bold"
                  : "text-red-600 font-bold"
              }
            >
              {socketStatus}
            </span>
          </p>
          <p>
            Subscribed Data Types:{" "}
            {Array.from(subscribedTypes.current).join(", ")}
          </p>
          <p>
            Recent Updates:{" "}
            {
              Object.entries(realtimeUpdates).filter(([, value]) => value)
                .length
            }
          </p>
          <div className="mt-2">
            <Button
              onClick={() => socketManager.connect()}
              disabled={
                socketStatus === "connected" || socketStatus === "connecting"
              }
              className="mr-2 text-xs"
            >
              Connect
            </Button>
            <Button
              onClick={() => socketManager.disconnect()}
              disabled={socketStatus !== "connected"}
              className="text-xs bg-red-500 hover:bg-red-600"
            >
              Disconnect
            </Button>
          </div>
        </div>
      )} */}
    </div>
  );
}

export default MarketDataDashboard;
