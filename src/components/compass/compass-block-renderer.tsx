import { AlertTriangle, TrendingUp, Newspaper, GraduationCap, FlaskConical, Info, Link2 } from "lucide-react";
import type { CompassBlock } from "@/lib/compass/schemas";
import { useTranslation } from "@/lib/i18n/locale-provider";

// Renders the 11 structured block types the Compass Agent can return
// (Phase 4, Section 25). Deliberately dumb/presentational — every block
// here has ALREADY passed validateCompassResult's schema validation
// server-side (see compass-engine.ts), so this component never needs its
// own defensive parsing; it only needs to render what it's given.

function BlockShell({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl bg-surface-2 px-3.5 py-3 text-[13px] leading-relaxed text-ink">{children}</div>;
}

function formatMoney(value: number | null, currency: string | null): string {
  if (value === null) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}${currency ? ` ${currency}` : ""}`;
}

/** Rounds and trims a quantity for display — a defensive second layer:
 * prompt-builder.ts already rounds numbers before they reach the model,
 * but a block's `quantity` is still model-generated free text the schema
 * validator only type-checks, not round-checks, so this component can't
 * assume it arrives already trimmed (the live bug this guards against —
 * a raw "0.0003392434057866783" reaching the UI — came from the model
 * echoing an unrounded value back verbatim). */
function formatQuantity(value: number | null): string {
  if (value === null) return "—";
  return Number(value.toFixed(6)).toString();
}

export function CompassBlockRenderer({ block }: { block: CompassBlock }) {
  const { t } = useTranslation();

  switch (block.type) {
    case "metric":
      return (
        <BlockShell>
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">
            {block.label}
            {block.period ? ` · ${block.period}` : ""}
          </p>
          <p className="mt-0.5 text-[17px] font-semibold text-ink">{block.value}</p>
        </BlockShell>
      );

    case "portfolio_summary":
      return (
        <BlockShell>
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">{block.label}</p>
          <p className="mt-0.5 text-[17px] font-semibold text-ink">{formatMoney(block.totalValue, block.currency)}</p>
          {block.changeToday !== null ? (
            <p className={block.changeToday >= 0 ? "text-xs text-green-600" : "text-xs text-rose-600"}>
              {formatMoney(block.changeToday, null)}
              {block.changeTodayPercent !== null ? ` (${block.changeTodayPercent >= 0 ? "+" : ""}${block.changeTodayPercent.toFixed(2)}%)` : ""}
            </p>
          ) : null}
        </BlockShell>
      );

    case "position":
      return (
        <BlockShell>
          <div className="flex items-center justify-between">
            <p className="font-medium text-ink">
              {block.symbol}
              {block.name ? <span className="ml-1 font-normal text-ink-muted">{block.name}</span> : null}
            </p>
            <span className="text-[11px] text-ink-faint">{block.source}</span>
          </div>
          <p className="mt-0.5 text-ink-muted">
            {formatQuantity(block.quantity)} · {formatMoney(block.value, block.currency)}
            {block.pnl !== null ? ` · ${formatMoney(block.pnl, null)}` : ""}
          </p>
        </BlockShell>
      );

    case "activity":
      return (
        <BlockShell>
          <div className="flex items-center justify-between gap-2">
            <p className="text-ink">{block.description}</p>
            {block.amount !== null ? <span className="shrink-0 font-medium text-ink">{formatMoney(block.amount, block.currency)}</span> : null}
          </div>
          <p className="mt-0.5 text-[11px] text-ink-faint">
            {block.date} · {block.source}
          </p>
        </BlockShell>
      );

    case "risk":
      return (
        <BlockShell>
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-orange-500" />
            <div>
              <p className="font-medium text-ink">{block.label}</p>
              <p className="mt-0.5 text-ink-muted">{block.description}</p>
            </div>
          </div>
        </BlockShell>
      );

    case "news":
      return (
        <a href={block.url} target="_blank" rel="noreferrer" className="block">
          <BlockShell>
            <div className="flex items-start gap-2">
              <Newspaper size={16} className="mt-0.5 shrink-0 text-blue-500" />
              <div>
                <p className="font-medium text-ink">{block.title}</p>
                <p className="mt-0.5 text-[11px] text-ink-faint">{block.source}</p>
              </div>
            </div>
          </BlockShell>
        </a>
      );

    case "asset":
      return (
        <BlockShell>
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className="shrink-0 text-purple" />
            <p className="font-medium text-ink">
              {block.name} <span className="text-ink-faint">({block.symbol})</span>
            </p>
          </div>
        </BlockShell>
      );

    case "education":
      return (
        <BlockShell>
          <div className="flex items-start gap-2">
            <GraduationCap size={16} className="mt-0.5 shrink-0 text-teal-500" />
            <div>
              <p className="font-medium text-ink">{block.title}</p>
              <p className="mt-0.5 text-ink-muted">{block.body}</p>
            </div>
          </div>
        </BlockShell>
      );

    case "scenario":
      return (
        <BlockShell>
          <div className="flex items-start gap-2">
            <FlaskConical size={16} className="mt-0.5 shrink-0 text-purple" />
            <div>
              <p className="font-medium text-ink">{block.label}</p>
              <p className="mt-0.5 text-[11px] italic text-ink-faint">{block.assumption}</p>
              <p className="mt-1 text-ink-muted">{block.impact}</p>
            </div>
          </div>
        </BlockShell>
      );

    case "data_limitation":
      return (
        <BlockShell>
          <div className="flex items-start gap-2">
            <Info size={16} className="mt-0.5 shrink-0 text-ink-faint" />
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">{t("compass.dataLimitationLabel")}</p>
              <p className="mt-0.5 text-ink-muted">{block.message}</p>
            </div>
          </div>
        </BlockShell>
      );

    case "source":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-ink-muted">
          <Link2 size={11} />
          {block.label}
        </span>
      );
  }
}
