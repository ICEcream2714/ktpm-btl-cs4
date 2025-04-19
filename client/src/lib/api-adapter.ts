import { GoldPriceData } from "./types";

export interface MarketDataItem {
  _id: string;
  dataType: string;
  dataPrice: string;
  timestamp: string;
  createdAt?: string;
  updatedAt?: string;
  __v?: number;
}

// Convert a market data item to the GoldPriceData format used by existing components
export function toGoldPriceData(item: MarketDataItem): GoldPriceData {
  return {
    timestamp: new Date(item.timestamp),
    price: parseFloat(item.dataPrice),
  };
}

// Convert an array of market data items of the same type to GoldPriceData format
export function marketDataToGoldPriceData(
  items: MarketDataItem[]
): GoldPriceData[] {
  return items
    .sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )
    .map(toGoldPriceData);
}

// Group market data by type
export function groupByDataType(
  marketData: MarketDataItem[]
): Record<string, MarketDataItem[]> {
  return marketData.reduce<Record<string, MarketDataItem[]>>((groups, item) => {
    const type = item.dataType;
    if (!groups[type]) {
      groups[type] = [];
    }
    groups[type].push(item);
    return groups;
  }, {});
}

// Get unique data types from market data
export function getUniqueDataTypes(marketData: MarketDataItem[]): string[] {
  return Array.from(new Set(marketData.map((item) => item.dataType)));
}

// Get latest price for each data type
export function getLatestPrices(
  marketData: MarketDataItem[]
): Record<string, MarketDataItem> {
  const grouped = groupByDataType(marketData);

  const latest: Record<string, MarketDataItem> = {};
  for (const [type, items] of Object.entries(grouped)) {
    items.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    latest[type] = items[0];
  }

  return latest;
}

// Transform API data for specific data type into chart-ready format
export function prepareChartData(
  marketData: MarketDataItem[],
  dataType: string
): GoldPriceData[] {
  return marketDataToGoldPriceData(
    marketData.filter((item) => item.dataType === dataType)
  );
}
