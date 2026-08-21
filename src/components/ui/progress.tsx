"use client";

import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";

export function Progress({
  value,
  className,
  indicatorClassName,
  trackClassName,
}: {
  value: number;
  className?: string;
  indicatorClassName?: string;
  trackClassName?: string;
}) {
  return (
    <ProgressPrimitive.Root
      value={value}
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-surface-2",
        trackClassName,
        className
      )}
    >
      <ProgressPrimitive.Indicator
        className={cn(
          "h-full flex-1 rounded-full bg-purple transition-transform duration-500 ease-out",
          indicatorClassName
        )}
        style={{ transform: `translateX(-${100 - Math.min(100, Math.max(0, value))}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}
