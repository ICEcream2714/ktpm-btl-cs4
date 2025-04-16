"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface PriceDisplayProps {
  currentPrice: number;
  previousPrice: number;
}

export function PriceDisplay({
  currentPrice,
  previousPrice,
}: PriceDisplayProps) {
  const priceChange = currentPrice - previousPrice;
  const percentChange = (priceChange / previousPrice) * 100;
  const isPositive = priceChange >= 0;

  return (
    <div className="flex flex-col items-center">
      <div className="text-4xl font-bold text-amber-900 mb-2">
        {formatCurrency(currentPrice)}
      </div>

      <div
        className={`flex items-center ${
          isPositive ? "text-green-600" : "text-red-600"
        }`}
      >
        {isPositive ? (
          <ArrowUp className="mr-1 h-4 w-4" />
        ) : (
          <ArrowDown className="mr-1 h-4 w-4" />
        )}
        <span className="font-medium">
          {formatCurrency(Math.abs(priceChange))} ({percentChange.toFixed(2)}%)
        </span>
      </div>

      <div className="mt-6 text-center">
        <div className="text-sm text-muted-foreground mb-2">
          Last updated: {new Date().toLocaleTimeString()}
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Today's High</p>
            <p className="font-medium">{formatCurrency(currentPrice + 15.5)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Today's Low</p>
            <p className="font-medium">
              {formatCurrency(currentPrice - 12.75)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
