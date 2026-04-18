import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  ChevronDown,
  Eye,
  FileText,
  Italic,
  List,
  ListOrdered,
  Loader2,
  Plus,
  Redo,
  Trash2,
  Undo,
  X,
} from "lucide-react";
import {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  type Template,
} from "@/api/templates";

// ─── constants ───────────────────────────────────────────────────────────────

const VARIABLES = [
  { key: "sender_name", label: "Sender's name", example: "Alice" },
  { key: "original_subject", label: "Original subject", example: "Your Order #1234" },
  { key: "date", label: "Today's date", example: "April 17, 2026" },
  { key: "your_name", label: "Your display name", example: "Support Team" },
];

// ─── toolbar button ───────────────────────────────────────────────────────────

function ToolbarBtn({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded p-1.5 transition-colors ${
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      } disabled:cursor-not-allowed disabled:opacity-40`}
    >
      {children}
    </button>
  );
}

// ─── editor toolbar ───────────────────────────────────────────────────────────

function EditorToolbar({
  editor,
  onInsertVariable,
}: {
  editor: ReturnType<typeof useEditor>;
  onInsertVariable: (key: string) => void;
}) {
  const [varOpen, setVarOpen] = useState(false);
  const varRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (varRef.current && !varRef.current.contains(e.target as Node)) setVarOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  if (!editor) return null;

  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-t-md border border-border bg-muted/40 px-2 py-1">
      <ToolbarBtn
        title="Bold"
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive("bold")}
      >
        <Bold className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <ToolbarBtn
        title="Italic"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive("italic")}
      >
        <Italic className="h-3.5 w-3.5" />
      </ToolbarBtn>

      <div className="mx-1 h-4 w-px bg-border" />

      <ToolbarBtn
        title="Bullet list"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive("bulletList")}
      >
        <List className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <ToolbarBtn
        title="Numbered list"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive("orderedList")}
      >
        <ListOrdered className="h-3.5 w-3.5" />
      </ToolbarBtn>

      <div className="mx-1 h-4 w-px bg-border" />

      <ToolbarBtn
        title="Undo"
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
      >
        <Undo className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <ToolbarBtn
        title="Redo"
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
      >
        <Redo className="h-3.5 w-3.5" />
      </ToolbarBtn>

      {/* Variable inserter */}
      <div className="relative ml-auto" ref={varRef}>
        <button
          type="button"
          onClick={() => setVarOpen(!varOpen)}
          className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          {"{ }"} Insert variable
          <ChevronDown className={`h-3 w-3 transition-transform ${varOpen ? "rotate-180" : ""}`} />
        </button>
        {varOpen && (
          <div className="absolute right-0 top-full z-20 mt-1 w-64 rounded-lg border border-border bg-card shadow-lg">
            <p className="px-3 py-2 text-xs font-medium text-muted-foreground border-b border-border">
              Click to insert into your template
            </p>
            {VARIABLES.map((v) => (
              <button
                key={v.key}
                type="button"
                className="flex w-full flex-col px-3 py-2 text-left hover:bg-accent transition-colors"
                onClick={() => {
                  onInsertVariable(v.key);
                  setVarOpen(false);
                }}
              >
                <span className="font-mono text-xs text-primary">{`{{${v.key}}}`}</span>
                <span className="text-xs text-muted-foreground">
                  {v.label} — e.g. "{v.example}"
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── main page ───────────────────────────────────────────────────────────────

interface FormState {
  id?: string;
  name: string;
  description: string;
  tags: string[];
}

export default function TemplatesPage() {
  const qc = useQueryClient();

  const [form, setForm] = useState<FormState>({ name: "", description: "", tags: [] });
  const [tagInput, setTagInput] = useState("");
  const [isNew, setIsNew] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["templates"],
    queryFn: listTemplates,
  });

  // Tiptap editor
  const editor = useEditor({
    extensions: [StarterKit],
    content: "",
    onUpdate: ({ editor }) => {
      setPreviewHtml(editor.getHTML());
    },
  });

  // Mutations
  const saveMutation = useMutation({
    mutationFn: async () => {
      const body_html = editor?.getHTML() ?? "";
      const body_text = editor?.getText() ?? "";
      const payload = {
        name: form.name,
        description: form.description || undefined,
        body_html,
        body_text,
        tags: form.tags,
      };
      if (isNew) {
        return createTemplate(payload);
      } else {
        return updateTemplate(form.id!, payload);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["templates"] });
      resetEditor();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTemplate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["templates"] });
      if (form.id === undefined || isNew) return;
      resetEditor();
    },
  });

  // Helpers
  function resetEditor() {
    setEditing(false);
    setIsNew(false);
    setShowPreview(false);
    setForm({ name: "", description: "", tags: [] });
    setTagInput("");
    editor?.commands.setContent("");
    setPreviewHtml("");
  }

  function startNew() {
    setIsNew(true);
    setEditing(true);
    setShowPreview(false);
    setForm({ name: "", description: "", tags: [] });
    setTagInput("");
    editor?.commands.setContent("<p></p>");
    setPreviewHtml("");
  }

  function startEdit(t: Template) {
    setIsNew(false);
    setEditing(true);
    setShowPreview(false);
    setForm({ id: t.id, name: t.name, description: t.description ?? "", tags: t.tags });
    setTagInput("");
    editor?.commands.setContent(t.body_html || "<p></p>");
    setPreviewHtml(t.body_html || "");
  }

  function insertVariable(key: string) {
    editor?.chain().focus().insertContent(`{{${key}}}`).run();
  }

  function addTag(raw: string) {
    const tag = raw.trim();
    if (tag && !form.tags.includes(tag)) {
      setForm((prev) => ({ ...prev, tags: [...prev.tags, tag] }));
    }
    setTagInput("");
  }

  function removeTag(tag: string) {
    setForm((prev) => ({ ...prev, tags: prev.tags.filter((t) => t !== tag) }));
  }

  const canSave = form.name.trim() && editor && editor.getText().trim();

  // ─── preview (swap live HTML with variable examples) ─────────────────────

  function renderPreview() {
    let html = previewHtml;
    VARIABLES.forEach((v) => {
      html = html.replaceAll(`{{${v.key}}}`, `<strong class="text-blue-600">${v.example}</strong>`);
    });
    return html;
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left panel: template list ──────────────────────────────────── */}
      <div className="flex w-72 shrink-0 flex-col border-r border-border">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold">Templates</h2>
            {templates.length > 0 && (
              <span className="rounded-full bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground">
                {templates.length}
              </span>
            )}
          </div>
          <button
            onClick={startNew}
            className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> New
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          )}

          {!isLoading && templates.length === 0 && (
            <div className="flex flex-col items-center gap-3 p-8 text-center">
              <FileText className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No templates yet</p>
              <button
                onClick={startNew}
                className="text-sm text-primary hover:underline underline-offset-2"
              >
                Create your first template
              </button>
            </div>
          )}

          {templates.map((t) => (
            <div
              key={t.id}
              onClick={() => startEdit(t)}
              className={`group cursor-pointer border-b border-border px-4 py-3 transition-colors hover:bg-accent/60 ${
                form.id === t.id && editing ? "bg-accent" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.name}</p>
                  {t.description && (
                    <p className="truncate text-xs text-muted-foreground mt-0.5">{t.description}</p>
                  )}
                  {t.tags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {t.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Used {t.use_count} {t.use_count === 1 ? "time" : "times"}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Delete "${t.name}"?`)) deleteMutation.mutate(t.id);
                  }}
                  className="shrink-0 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right panel: editor or placeholder ────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {!editing ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center p-10">
            <FileText className="h-12 w-12 text-muted-foreground/30" />
            <div>
              <p className="font-medium">Select a template to edit</p>
              <p className="mt-1 text-sm text-muted-foreground">or create a new one from the left panel</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 overflow-hidden">
            {/* Editor column */}
            <div className="flex flex-1 flex-col overflow-hidden">
              {/* Editor header */}
              <div className="flex items-center justify-between border-b border-border px-5 py-3">
                <h3 className="font-semibold">{isNew ? "New template" : "Edit template"}</h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowPreview(!showPreview)}
                    className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                      showPreview
                        ? "border-primary/50 bg-primary/5 text-primary"
                        : "border-border hover:bg-accent"
                    }`}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    {showPreview ? "Hide preview" : "Preview"}
                  </button>
                  <button
                    onClick={resetEditor}
                    className="rounded-md p-1.5 hover:bg-accent transition-colors"
                  >
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
              </div>

              {/* Form fields */}
              <div className="flex-1 overflow-auto p-5 space-y-4">
                {/* Name */}
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Template name <span className="text-destructive">*</span>
                  </label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder='e.g. "Invoice received" or "Out of office"'
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="mb-1 block text-sm font-medium">Description</label>
                  <p className="mb-1.5 text-xs text-muted-foreground">
                    Describe when to use this — the AI will read this to pick the right template automatically.
                  </p>
                  <input
                    value={form.description}
                    onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                    placeholder='e.g. "Use this when someone sends an invoice or payment receipt"'
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                {/* Body (rich text) */}
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Email body <span className="text-destructive">*</span>
                  </label>
                  <p className="mb-1.5 text-xs text-muted-foreground">
                    Write your reply. Use the <strong>Insert variable</strong> button to add personalised placeholders like the sender's name.
                  </p>
                  <div className="rounded-md border border-input focus-within:ring-2 focus-within:ring-ring">
                    <EditorToolbar editor={editor} onInsertVariable={insertVariable} />
                    <EditorContent
                      editor={editor}
                      className="prose prose-sm max-w-none px-3 py-3 min-h-[200px] text-sm focus:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[180px]"
                    />
                  </div>
                </div>

                {/* Tags */}
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Categories
                  </label>
                  <p className="mb-1.5 text-xs text-muted-foreground">
                    Add keywords that describe what this template is for — helps the AI pick the right one.
                  </p>
                  <div className="flex flex-wrap gap-1.5 rounded-md border border-input bg-background p-2 focus-within:ring-2 focus-within:ring-ring">
                    {form.tags.map((tag) => (
                      <span
                        key={tag}
                        className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
                      >
                        {tag}
                        <button onClick={() => removeTag(tag)}>
                          <X className="h-2.5 w-2.5 hover:text-destructive" />
                        </button>
                      </span>
                    ))}
                    <input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === ",") {
                          e.preventDefault();
                          addTag(tagInput);
                        } else if (e.key === "Backspace" && !tagInput && form.tags.length) {
                          setForm((p) => ({ ...p, tags: p.tags.slice(0, -1) }));
                        }
                      }}
                      onBlur={() => tagInput && addTag(tagInput)}
                      placeholder={form.tags.length === 0 ? "Type a category and press Enter…" : "Add another…"}
                      className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground min-w-[120px]"
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={() => saveMutation.mutate()}
                    disabled={!canSave || saveMutation.isPending}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {saveMutation.isPending ? (
                      <span className="flex items-center gap-1.5">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
                      </span>
                    ) : (
                      isNew ? "Create template" : "Save changes"
                    )}
                  </button>
                  <button
                    onClick={resetEditor}
                    className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent transition-colors"
                  >
                    Discard
                  </button>
                  {saveMutation.isError && (
                    <p className="text-xs text-destructive">Save failed — please try again.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Live preview column */}
            {showPreview && (
              <div className="flex w-[45%] shrink-0 flex-col border-l border-border overflow-hidden">
                <div className="border-b border-border px-4 py-3">
                  <p className="text-sm font-medium text-muted-foreground">Live preview</p>
                  <p className="text-xs text-muted-foreground">
                    Variables are shown with example values in{" "}
                    <span className="font-semibold text-blue-600">blue</span>
                  </p>
                </div>
                <div className="flex-1 overflow-auto p-5">
                  <div
                    className="prose prose-sm max-w-none text-sm"
                    dangerouslySetInnerHTML={{ __html: renderPreview() }}
                  />
                  {!previewHtml.replace(/<[^>]*>/g, "").trim() && (
                    <p className="text-sm text-muted-foreground">
                      Start typing in the editor to see your preview here.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
