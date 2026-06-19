import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { createCase, addEvidence, analyzeCase } from "@/lib/cases.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Disclaimer } from "@/components/Disclaimer";
import { toast } from "sonner";
import { Loader2, Upload, X, ImageIcon } from "lucide-react";

export const Route = createFileRoute("/_authenticated/cases/new")({
  head: () => ({ meta: [{ title: "New case · IPC Analyzer AI" }] }),
  component: NewCase,
});

function NewCase() {
  const navigate = useNavigate();
  const create = useServerFn(createCase);
  const attach = useServerFn(addEvidence);
  const analyze = useServerFn(analyzeCase);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState("");

  const onDrop = useCallback((accepted: File[]) => {
    setFiles((prev) =>
      [...prev, ...accepted.filter((f) => f.size < 10 * 1024 * 1024)].slice(0, 8),
    );
  }, []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [".jpg", ".jpeg", ".png", ".webp"] },
    maxFiles: 8,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      toast.error("Please add a title and incident description.");
      return;
    }
    setLoading(true);
    try {
      setStage("Creating case…");
      const { id: caseId } = await create({
        data: { title: title.trim(), description: description.trim() },
      });

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user!.id;

      const uploaded: Array<{
        kind: "image";
        storage_path: string;
        mime_type: string;
      }> = [];

      if (files.length) {
        setStage(`Uploading ${files.length} file(s)…`);
        for (const f of files) {
          const ext = f.name.split(".").pop() ?? "bin";
          const path = `${userId}/${caseId}/${crypto.randomUUID()}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from("evidence")
            .upload(path, f, { contentType: f.type, upsert: false });
          if (upErr) throw upErr;
          uploaded.push({ kind: "image", storage_path: path, mime_type: f.type });
        }
        await attach({ data: { caseId, items: uploaded } });
      }

      setStage("Analysing with AI… this can take 20–60 seconds.");
      await analyze({ data: { caseId } });
      toast.success("Analysis complete.");
      navigate({ to: "/cases/$caseId", params: { caseId } });
    } catch (err) {
      console.error(err);
      toast.error((err as Error).message || "Something went wrong.");
    } finally {
      setLoading(false);
      setStage("");
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">New case analysis</h1>
        <p className="text-sm text-muted-foreground">
          Describe the incident and optionally upload images. The AI will identify
          potentially applicable Indian legal provisions.
        </p>
      </div>

      <Disclaimer />

      <div className="space-y-2">
        <Label htmlFor="title">Case title</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Assault outside Connaught Place, 14 March"
          maxLength={200}
          required
          disabled={loading}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="desc">Incident description</Label>
        <Textarea
          id="desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe what happened — who was involved, what was said or done, where, when, weapons or property involved, injuries, witnesses…"
          rows={10}
          maxLength={20000}
          required
          disabled={loading}
        />
        <div className="text-right text-xs text-muted-foreground">
          {description.length.toLocaleString()} / 20,000
        </div>
      </div>

      <div className="space-y-2">
        <Label>Image evidence (optional)</Label>
        <div
          {...getRootProps()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition ${
            isDragActive
              ? "border-primary bg-primary/5"
              : "border-border hover:border-foreground/30"
          }`}
        >
          <input {...getInputProps()} disabled={loading} />
          <Upload className="mb-2 h-6 w-6 text-muted-foreground" />
          <div className="text-sm">
            {isDragActive ? "Drop images here…" : "Drag images here or click to browse"}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            JPG / PNG / WEBP · up to 10 MB each · max 8 files
          </div>
        </div>
        {files.length > 0 && (
          <ul className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {files.map((f, i) => (
              <li
                key={i}
                className="flex items-center gap-2 rounded-md border border-border bg-card p-2 text-xs"
              >
                <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate flex-1">{f.name}</span>
                <button
                  type="button"
                  onClick={() => setFiles(files.filter((_, j) => j !== i))}
                  className="text-muted-foreground hover:text-destructive"
                  disabled={loading}
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border pt-5">
        <div className="text-xs text-muted-foreground">{stage}</div>
        <Button type="submit" size="lg" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Analyse case
        </Button>
      </div>
    </form>
  );
}
