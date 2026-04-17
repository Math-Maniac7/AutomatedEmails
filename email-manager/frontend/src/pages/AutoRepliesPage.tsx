import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, ToggleLeft, ToggleRight, FlaskConical } from "lucide-react";
import { listRules, createRule, deleteRule, toggleRule, testRule, getReplyLog, AutoReplyRule } from "@/api/autoReplies";
import { listTemplates } from "@/api/templates";

const TRIGGER_TYPES = ["keyword", "sender_domain", "sender_email", "subject_contains", "any_email", "ai_classified"];
const ACTION_TYPES = ["use_template", "ai_select_template", "ai_generate"];

export default function AutoRepliesPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"rules" | "log">("rules");
  const [creating, setCreating] = useState(false);
  const [testing, setTesting] = useState<AutoReplyRule | null>(null);
  const [testResult, setTestResult] = useState<any>(null);
  const [testInput, setTestInput] = useState({ subject: "", body: "", from: "test@example.com" });
  const [form, setForm] = useState<Partial<AutoReplyRule>>({
    name: "",
    trigger_type: "keyword",
    action_type: "use_template",
    keywords: [],
    keywords_match_mode: "any",
    priority: 100,
    max_replies_per_sender_per_day: 1,
    cooldown_hours: 24,
    is_active: true,
  });
  const [keywordsInput, setKeywordsInput] = useState("");

  const { data: rules = [] } = useQuery({ queryKey: ["rules"], queryFn: listRules });
  const { data: templates = [] } = useQuery({ queryKey: ["templates"], queryFn: listTemplates });
  const { data: log = [] } = useQuery({ queryKey: ["reply-log"], queryFn: () => getReplyLog(), enabled: tab === "log" });

  const createMutation = useMutation({
    mutationFn: () => createRule({ ...form, keywords: keywordsInput.split(",").map((k) => k.trim()).filter(Boolean) } as any),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["rules"] }); setCreating(false); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteRule(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rules"] }),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => toggleRule(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rules"] }),
  });

  const testMutation = useMutation({
    mutationFn: () =>
      testRule({ rule_id: testing!.id, sample_subject: testInput.subject, sample_body: testInput.body, sample_from: testInput.from }),
    onSuccess: (data) => setTestResult(data),
  });

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Auto-Reply Rules</h1>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground text-sm rounded-md hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" /> New Rule
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-border mb-6">
        {(["rules", "log"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`pb-2 text-sm font-medium capitalize border-b-2 transition-colors ${
              tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "log" ? "Reply Log" : "Rules"}
          </button>
        ))}
      </div>

      {/* Create form */}
      {creating && (
        <div className="border border-border rounded-lg p-4 mb-6 space-y-3 bg-card">
          <h3 className="font-medium">New Auto-Reply Rule</h3>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Name *</label>
              <input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border border-input rounded px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Priority (lower = higher)</label>
              <input type="number" value={form.priority || 100} onChange={(e) => setForm({ ...form, priority: +e.target.value })}
                className="w-full border border-input rounded px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Trigger type</label>
              <select value={form.trigger_type} onChange={(e) => setForm({ ...form, trigger_type: e.target.value })}
                className="w-full border border-input rounded px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring">
                {TRIGGER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Action type</label>
              <select value={form.action_type} onChange={(e) => setForm({ ...form, action_type: e.target.value })}
                className="w-full border border-input rounded px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring">
                {ACTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {(form.trigger_type === "keyword") && (
            <div>
              <label className="block text-xs font-medium mb-1">Keywords (comma-separated)</label>
              <input value={keywordsInput} onChange={(e) => setKeywordsInput(e.target.value)}
                className="w-full border border-input rounded px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="invoice, payment, billing" />
            </div>
          )}

          {(form.trigger_type === "sender_domain" || form.trigger_type === "sender_email") && (
            <div>
              <label className="block text-xs font-medium mb-1">Sender filter</label>
              <input value={form.sender_filter || ""} onChange={(e) => setForm({ ...form, sender_filter: e.target.value })}
                className="w-full border border-input rounded px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder={form.trigger_type === "sender_domain" ? "@company.com" : "boss@company.com"} />
            </div>
          )}

          {form.action_type === "use_template" && (
            <div>
              <label className="block text-xs font-medium mb-1">Template</label>
              <select value={form.template_id || ""} onChange={(e) => setForm({ ...form, template_id: e.target.value })}
                className="w-full border border-input rounded px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring">
                <option value="">Select template...</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}

          {(form.action_type === "ai_generate" || form.action_type === "ai_select_template") && (
            <div>
              <label className="block text-xs font-medium mb-1">AI instructions</label>
              <textarea value={form.ai_instructions || ""} onChange={(e) => setForm({ ...form, ai_instructions: e.target.value })}
                rows={2} className="w-full border border-input rounded px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                placeholder="Reply professionally and ask for more details if needed." />
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={() => createMutation.mutate()} disabled={!form.name || createMutation.isPending}
              className="px-3 py-1.5 bg-primary text-primary-foreground text-sm rounded hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {createMutation.isPending ? "Creating..." : "Create Rule"}
            </button>
            <button onClick={() => setCreating(false)}
              className="px-3 py-1.5 border border-border text-sm rounded hover:bg-accent transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Rules list */}
      {tab === "rules" && (
        <div className="space-y-3">
          {rules.length === 0 && <p className="text-muted-foreground text-sm">No rules yet. Create one above.</p>}
          {rules.map((rule) => (
            <div key={rule.id} className="border border-border rounded-lg p-4 bg-card">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{rule.name}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${rule.is_active ? "bg-green-100 text-green-700" : "bg-secondary text-muted-foreground"}`}>
                      {rule.is_active ? "Active" : "Disabled"}
                    </span>
                    <span className="text-xs text-muted-foreground">Priority {rule.priority}</span>
                  </div>
                  <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                    <span>Trigger: <span className="text-foreground">{rule.trigger_type}</span></span>
                    <span>Action: <span className="text-foreground">{rule.action_type}</span></span>
                    {rule.keywords.length > 0 && <span>Keywords: {rule.keywords.join(", ")}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => { setTesting(rule); setTestResult(null); }} className="p-1.5 rounded hover:bg-accent">
                    <FlaskConical className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                  <button onClick={() => toggleMutation.mutate(rule.id)} className="p-1.5 rounded hover:bg-accent">
                    {rule.is_active
                      ? <ToggleRight className="h-4 w-4 text-primary" />
                      : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                  </button>
                  <button onClick={() => deleteMutation.mutate(rule.id)} className="p-1.5 rounded hover:bg-destructive/10">
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </button>
                </div>
              </div>

              {/* Inline test panel */}
              {testing?.id === rule.id && (
                <div className="mt-3 pt-3 border-t border-border space-y-2">
                  <p className="text-xs font-medium">Test this rule</p>
                  <div className="grid grid-cols-3 gap-2">
                    <input value={testInput.from} onChange={(e) => setTestInput({ ...testInput, from: e.target.value })}
                      placeholder="from@example.com" className="border border-input rounded px-2 py-1 text-xs bg-background focus:outline-none" />
                    <input value={testInput.subject} onChange={(e) => setTestInput({ ...testInput, subject: e.target.value })}
                      placeholder="Subject..." className="border border-input rounded px-2 py-1 text-xs bg-background focus:outline-none" />
                    <input value={testInput.body} onChange={(e) => setTestInput({ ...testInput, body: e.target.value })}
                      placeholder="Body preview..." className="border border-input rounded px-2 py-1 text-xs bg-background focus:outline-none" />
                  </div>
                  <button onClick={() => testMutation.mutate()} disabled={testMutation.isPending}
                    className="px-2.5 py-1 bg-primary text-primary-foreground text-xs rounded hover:bg-primary/90 disabled:opacity-50 transition-colors">
                    Run Test
                  </button>
                  {testResult && (
                    <p className={`text-xs font-medium ${testResult.matched ? "text-green-600" : "text-destructive"}`}>
                      {testResult.matched ? "Rule would match this email" : "Rule would NOT match this email"}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Reply log */}
      {tab === "log" && (
        <div className="space-y-2">
          {log.length === 0 && <p className="text-muted-foreground text-sm">No auto-replies sent yet.</p>}
          {log.map((entry) => (
            <div key={entry.id} className="border border-border rounded-lg p-3 bg-card text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">{entry.recipient_email}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  entry.status === "sent" ? "bg-green-100 text-green-700" :
                  entry.status === "skipped" ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"
                }`}>{entry.status}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {new Date(entry.created_at).toLocaleString()}
                {entry.ai_model_used && ` · AI: ${entry.ai_model_used}`}
              </div>
              {entry.error_message && <p className="text-xs text-destructive mt-1">{entry.error_message}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
