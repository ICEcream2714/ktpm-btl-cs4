"use client";

import { useEffect, useRef } from "react";
import type { GoldPriceData } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

interface PriceChartProps {
  data: GoldPriceData[];
  timeframe: string;
}

export function PriceChart({ data, timeframe }: PriceChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || data.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas dimensions
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.clearRect(0, 0, rect.width, rect.height);

    // Extract price data
    const prices = data.map((item) => item.price);
    const minPrice = Math.min(...prices) * 0.999;
    const maxPrice = Math.max(...prices) * 1.001;
    const priceRange = maxPrice - minPrice;

    // Calculate start color and end color based on price trend
    const startPrice = prices[0];
    const endPrice = prices[prices.length - 1];
    const isPositiveTrend = endPrice >= startPrice;

    // Set gradient colors
    const gradient = ctx.createLinearGradient(0, 0, 0, rect.height);
    if (isPositiveTrend) {
      gradient.addColorStop(0, "rgba(34, 197, 94, 0.5)");
      gradient.addColorStop(1, "rgba(34, 197, 94, 0.05)");
    } else {
      gradient.addColorStop(0, "rgba(239, 68, 68, 0.5)");
      gradient.addColorStop(1, "rgba(239, 68, 68, 0.05)");
    }

    // Draw the area under the line
    ctx.beginPath();
    data.forEach((item, index) => {
      const x = (index / (data.length - 1)) * rect.width;
      const y =
        rect.height - ((item.price - minPrice) / priceRange) * rect.height;

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    // Complete the area by drawing to the bottom corners
    ctx.lineTo(rect.width, rect.height);
    ctx.lineTo(0, rect.height);
    ctx.closePath();

    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw the line
    ctx.beginPath();
    data.forEach((item, index) => {
      const x = (index / (data.length - 1)) * rect.width;
      const y =
        rect.height - ((item.price - minPrice) / priceRange) * rect.height;

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.strokeStyle = isPositiveTrend ? "#16a34a" : "#dc2626";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw price labels
    ctx.font = "12px sans-serif";
    ctx.fillStyle = "#6b7280";
    ctx.textAlign = "left";
    ctx.fillText(formatCurrency(maxPrice), 5, 15);
    ctx.textAlign = "left";
    ctx.fillText(formatCurrency(minPrice), 5, rect.height - 5);

    // Draw the current price label
    const currentPrice = prices[prices.length - 1];
    const currentY =
      rect.height - ((currentPrice - minPrice) / priceRange) * rect.height;

    ctx.beginPath();
    ctx.moveTo(rect.width - 60, currentY);
    ctx.lineTo(rect.width, currentY);
    ctx.strokeStyle = "#6b7280";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = isPositiveTrend ? "#16a34a" : "#dc2626";
    ctx.textAlign = "right";
    ctx.fillText(formatCurrency(currentPrice), rect.width - 5, currentY - 5);
  }, [data, timeframe]);

  return (
    <div className="relative w-full h-full">
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}
