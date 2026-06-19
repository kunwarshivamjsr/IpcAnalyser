import { Scale } from "lucide-react";

export function Logo({ withText = true }: { withText?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="grid h-9 w-9 place-items-center rounded-md bg-primary text-primary-foreground">
        <Scale className="h-5 w-5" />
      </div>
      {withText && (
        <div className="leading-tight">
          <div className="font-display text-lg font-semibold">IPC Analyzer</div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            AI Legal Research
          </div>
        </div>
      )}
    </div>
  );
}
