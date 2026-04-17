import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Edit2, Eye } from "lucide-react";
import { listTemplates, createTemplate, updateTemplate, deleteTemplate, previewTemplate, Template } from "@/api/templates";

export default function TemplatesPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Template> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [preview, setPreview] = useState<{ body_html: string; body_text: string } | null>(null);

  const { data: templates = [], isLoading } = useQuery({ queryKey: ["templates"], queryFn: listTemplates });

  const saveMutation = useMutation({
    mutationFn: (data: Partial<Template> & { name: string; body_html: string }) =>
      isNew ? createTemplate(data) : updateTemplate(editing!.id!, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["templates"] }); setEditing(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates"] }),
  });

  const previewMutation = useMutation({
    mutationFn: (id: string) => previewTemplate(id, { sender_name: "Alice", original_subject: "Test Subject" }),
    onSuccess: (data) => setPreview(data),
  });

  function startNew() {
    setIsNew(true);
    setEditing({ name: "", body_html: "", body_text: "", description: "", tags: [] });
  }

  function startEdit(t: Template) {
    setIsNew(false);
    setEditing(t);
  }

  function handleSave() {
    if (!editing?.name || !editing?.body_html) return;
    saveMutation.mutate(editing as any);
  }

  return (
    <div className="flex h-full">
      {/* Template list */}
      <div className="w-72 border-r border-border flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-semibold">Templates</h2>
          <button
            onClick={startNew}
            className="flex items-center gap-1 text-sm text-primary hover:underline"
          >
            <Plus className="h-4 w-4" /> New
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          {isLoading && <p className="p-4 text-sm text-muted-foreground">Loading...</p>}
          {templates.map((t) => (
            <div
              key={t.id}
              className={`px-4 py-3 border-b border-border hover:bg-accent/50 cursor-pointer ${editing?.id === t.id ? "bg-accent" : ""}`}
              onClick={() => startEdit(t)}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t.description || "No description"}</p>
                  {t.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {t.tags.map((tag) => (
                        <span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-1 ml-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); previewMutation.mutate(t.id); }}
                    className="p-1 rounded hover:bg-accent"
                  >
                    <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(t.id); }}
                    className="p-1 rounded hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Used {t.use_count} times</p>
            </div>
          ))}
        </div>
      </div>

      {/* Editor / Preview */}
      <div className="flex-1 overflow-auto p-6">
        {preview ? (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Template Preview</h3>
              <button onClick={() => setPreview(null)} className="text-sm text-primary hover:underline">Close</button>
            </div>
            <div className="border border-border rounded-lg p-4">
              <div dangerouslySetInnerHTML={{ __html: preview.body_html }} />
            </div>
          </div>
        ) : editing ? (
          <div className="space-y-4 max-w-2xl">
            <h3 className="font-semibold">{isNew ? "New Template" : "Edit Template"}</h3>

            <div>
              <label className="block text-sm font-medium mb-1">Name *</label>
              <input
                value={editing.name || ""}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <input
                value={editing.description || ""}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Subject line (optional)</label>
              <input
                value={editing.subject_line || ""}
                onChange={(e) => setEditing({ ...editing, subject_line: e.target.value })}
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Body (HTML) * — use {"{{variable_name}}"} for placeholders
              </label>
              <textarea
                value={editing.body_html || ""}
                onChange={(e) => setEditing({ ...editing, body_html: e.target.value })}
                rows={12}
                className="w-full border border-input rounded-md px-3 py-2 text-sm font-mono bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                placeholder="<p>Hi {{sender_name}},</p><p>Thank you for your message...</p>"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Tags (comma-separated)</label>
              <input
                value={(editing.tags || []).join(", ")}
                onChange={(e) => setEditing({ ...editing, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="support, billing, general"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saveMutation.isPending || !editing.name || !editing.body_html}
                className="px-4 py-2 bg-primary text-primary-foreground text-sm rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {saveMutation.isPending ? "Saving..." : "Save Template"}
              </button>
              <button
                onClick={() => setEditing(null)}
                className="px-4 py-2 border border-border text-sm rounded-md hover:bg-accent transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Select a template to edit or create a new one
          </div>
        )}
      </div>
    </div>
  );
}
