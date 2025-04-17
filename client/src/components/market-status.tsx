"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

export function MarketStatus() {
  const [isMarketOpen, setIsMarketOpen] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<string>("");

  useEffect(() => {
    const checkMarketStatus = () => {
      const now = new Date();
      const hours = now.getUTCHours();
      const day = now.getUTCDay();

      // Simplified market hours check (Mon-Fri, 8am-5pm UTC)
      const isWeekday = day >= 1 && day <= 5;
      const isBusinessHours = hours >= 8 && hours < 17;

      setIsMarketOpen(isWeekday && isBusinessHours);
      setCurrentTime(now.toLocaleTimeString());
    };

    checkMarketStatus();
    const interval = setInterval(checkMarketStatus, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-1.5">
      <Clock className="h-4 w-4 text-muted-foreground" />
      <span className="text-xs">
        {currentTime} - Market is{" "}
        {isMarketOpen ? (
          <span className="text-green-600 font-medium">Open</span>
        ) : (
          <span className="text-amber-600 font-medium">Closed</span>
        )}
      </span>
    </div>
  );
}
