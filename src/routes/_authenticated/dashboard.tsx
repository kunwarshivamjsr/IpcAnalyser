import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { listCases, deleteCase } from "@/lib/cases.functions";
import { Button } from "@/components/ui/button";
import { Plus, FileText, Trash2, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Disclaimer } from "@/components/Disclaimer";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard · IPC Analyzer AI" }] }),
  component: Dashboard,
});

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  analyzing: "bg-warning/15 text-warning",
  completed: "bg-success/15 text-success",
  failed: "bg-destructive/15 text-destructive",
};

function Dashboard() {
  const navigate = useNavigate();
  const router = useRouter();
  const fetchCases = useServerFn(listCases);
  const removeCase = useServerFn(deleteCase);

  const { data, isLoading } = useQuery({
    queryKey: ["cases"],
    queryFn: () => fetchCases(),
  });

  const del = useMutation({
    mutationFn: (id: string) => removeCase({ data: { caseId: id } }),
    onSuccess: () => {
      toast.success("Case deleted");
      router.invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Your cases</h1>
          <p className="text-sm text-muted-foreground">
            Analyse incidents and review AI-suggested Indian legal provisions.
          </p>
        </div>
        <Button onClick={() => navigate({ to: "/cases/new" })}>
          <Plus className="mr-2 h-4 w-4" /> New case
        </Button>
      </div>

      <Disclaimer />

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !data || data.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center">
          <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <div className="font-display text-xl">No cases yet</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Start by describing an incident and uploading any evidence.
          </p>
          <Button className="mt-5" onClick={() => navigate({ to: "/cases/new" })}>
            <Plus className="mr-2 h-4 w-4" /> Create your first case
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((c) => (
            <div
              key={c.id}
              className="group relative rounded-xl border border-border bg-card p-4 transition hover:border-foreground/20"
            >
              <Link
                to="/cases/$caseId"
                params={{ caseId: c.id }}
                className="block"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="line-clamp-2 font-display text-lg font-semibold">
                    {c.title}
                  </h3>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${STATUS_STYLES[c.status] ?? STATUS_STYLES.draft}`}
                  >
                    {c.status}
                  </span>
                </div>
                <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                  {c.description || "No description"}
                </p>
                <div className="mt-3 text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(c.created_at))} ago
                </div>
              </Link>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm("Delete this case?")) del.mutate(c.id);
                }}
                className="absolute right-3 top-3 hidden rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover:block"
                aria-label="Delete case"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
