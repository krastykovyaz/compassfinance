import { cn } from "@/lib/utils";
import { ColorKey } from "@/lib/mock-data";
import { ReactNode } from "react";

const colorMap: Record<ColorKey, string> = {
  blue: "bg-blue-50 text-blue-600",
  green: "bg-green-50 text-green-600",
  purple: "bg-purple-50 text-purple-600",
  orange: "bg-orange-50 text-orange-600",
  teal: "bg-teal-50 text-teal-600",
  rose: "bg-rose-50 text-rose-600",
  slate: "bg-slate-100 text-slate-600",
};

export function IconCircle({
  children,
  colorKey = "slate",
  size = "md",
  className,
}: {
  children: ReactNode;
  colorKey?: ColorKey;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizeMap = {
    sm: "h-8 w-8",
    md: "h-10 w-10",
    lg: "h-12 w-12",
  };
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full",
        sizeMap[size],
        colorMap[colorKey],
        className
      )}
    >
      {children}
    </div>
  );
}
