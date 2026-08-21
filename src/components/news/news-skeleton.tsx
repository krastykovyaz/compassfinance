import { Card } from "@/components/ui/card";

export function NewsSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2, 3].map((i) => (
        <Card key={i} className="animate-pulse">
          <div className="mb-2 h-3 w-24 rounded bg-surface-2" />
          <div className="flex gap-3">
            <div className="flex-1 space-y-2">
              <div className="h-4 w-full rounded bg-surface-2" />
              <div className="h-4 w-3/4 rounded bg-surface-2" />
              <div className="h-3 w-1/2 rounded bg-surface-2" />
            </div>
            <div className="h-16 w-16 shrink-0 rounded-xl bg-surface-2" />
          </div>
        </Card>
      ))}
    </div>
  );
}
