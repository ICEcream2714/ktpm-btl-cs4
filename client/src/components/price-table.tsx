import type { GoldPriceData } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ArrowDown, ArrowUp } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface PriceTableProps {
  data: GoldPriceData[];
}

export function PriceTable({ data }: PriceTableProps) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date & Time</TableHead>
            <TableHead>Price (USD)</TableHead>
            <TableHead>Change</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((item, index) => {
            const prevItem = index < data.length - 1 ? data[index + 1] : null;
            const priceChange = prevItem ? item.price - prevItem.price : 0;
            const percentChange = prevItem
              ? (priceChange / prevItem.price) * 100
              : 0;
            const isPositive = priceChange >= 0;

            return (
              <TableRow key={index}>
                <TableCell>{formatDate(item.timestamp)}</TableCell>
                <TableCell className="font-medium">
                  {formatCurrency(item.price)}
                </TableCell>
                <TableCell>
                  {prevItem && (
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
                      <span>
                        {formatCurrency(Math.abs(priceChange))} (
                        {Math.abs(percentChange).toFixed(2)}%)
                      </span>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
