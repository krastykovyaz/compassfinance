import { TriangleAlert } from "lucide-react";
import { formatNumber, formatSignedPercent, cn } from "@/lib/utils";

export function AssetHeader({
  name,
  price,
  changePct,
}: {
  name: string;
  /** Null when a live quote isn't available yet — never a fake/mock price. */
  price: number | null;
  changePct: number | null;
}) {
  const positive = (changePct ?? 0) >= 0;
  return (
    <div>
      <p className="text-[14px] text-ink-muted">{name}</p>
      {price != null && changePct != null ? (
        <>
          <p className="mt-1 text-[28px] font-semibold tracking-tight text-ink">
            {formatNumber(price)}
          </p>
          <span
            className={cn(
              "text-[13px] font-medium",
              positive ? "text-positive" : "text-negative"
            )}
          >
            {formatSignedPercent(changePct)} today
          </span>
        </>
      ) : (
        <div className="mt-1 flex items-center gap-1.5 text-ink-faint">
          <TriangleAlert size={16} />
          <p className="text-[15px] font-medium">Market data unavailable</p>
        </div>
      )}
    </div>
  );
}
