import { cn } from "@/lib/utils";
import { ColorKey } from "@/lib/mock-data";
import { HTMLAttributes } from "react";

const colorMap: Record<ColorKey, string> = {
  blue: "bg-blue-50 text-blue-700",
  green: "bg-green-50 text-green-700",
  purple: "bg-purple-50 text-purple-700",
  orange: "bg-orange-50 text-orange-700",
  teal: "bg-teal-50 text-teal-700",
  rose: "bg-rose-50 text-rose-700",
  slate: "bg-slate-100 text-slate-700",
};

export function Badge({
  className,
  colorKey = "slate",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { colorKey?: ColorKey }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        colorMap[colorKey],
        className
      )}
      {...props}
    />
  );
}
