import { ShieldAlert } from "lucide-react";
import { LEGAL_DISCLAIMER } from "@/lib/legal-prompts";

export function Disclaimer({ className = "" }: { className?: string }) {
  return (
    <div
      className={
        "flex gap-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-foreground " +
        className
      }
    >
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      <p className="leading-relaxed">
        <span className="font-semibold uppercase tracking-wider">Disclaimer: </span>
        {LEGAL_DISCLAIMER}
      </p>
    </div>
  );
}
