import { cn } from "@/lib/utils";
import { HTMLAttributes } from "react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[20px] border border-border bg-surface p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]",
        className
      )}
      {...props}
    />
  );
}

export function DarkCard({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[20px] border border-dark-border bg-dark-card p-4 text-dark-ink",
        className
      )}
      {...props}
    />
  );
}
