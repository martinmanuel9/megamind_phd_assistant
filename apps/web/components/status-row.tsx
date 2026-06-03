import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatusRow({
  ok,
  label,
  detail,
}: {
  ok: boolean;
  label: string;
  detail?: string;
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      {ok ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
      ) : (
        <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
      )}
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {detail && (
          <div className={cn("text-xs", ok ? "text-muted-foreground" : "text-destructive/80")}>
            {detail}
          </div>
        )}
      </div>
    </div>
  );
}
