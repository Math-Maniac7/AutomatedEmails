import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, RefreshCw, CheckCircle, XCircle } from "lucide-react";
import { listAccounts, connectImapAccount, deleteAccount, testAccount, syncAccount } from "@/api/accounts";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export default function SettingsPage() {
  const qc = useQueryClient();
  const [showImapForm, setShowImapForm] = useState(false);
  const [testStatus, setTestStatus] = useState<Record<string, "ok" | "fail">>({});
  const [form, setForm] = useState({
    email_address: "",
    password: "",
    display_name: "",
    imap_host: "",
    imap_port: 993,
    imap_use_ssl: true,
    smtp_host: "",
    smtp_port: 587,
    smtp_use_tls: true,
    color_label: "#6366f1",
  });

  const { data: accounts = [] } = useQuery({ queryKey: ["accounts"], queryFn: listAccounts });

  const connectMutation = useMutation({
    mutationFn: () => connectImapAccount(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["accounts"] }); setShowImapForm(false); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAccount(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accounts"] }),
  });

  const syncMutation = useMutation({
    mutationFn: (id: string) => syncAccount(id),
  });

  async function handleTest(id: string) {
    try {
      await testAccount(id);
      setTestStatus((s) => ({ ...s, [id]: "ok" }));
    } catch {
      setTestStatus((s) => ({ ...s, [id]: "fail" }));
    }
  }

  return (
    <div className="p-6 max-w-2xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold mb-1">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your connected email accounts.</p>
      </div>

      {/* Connected accounts */}
      <div>
        <h2 className="text-base font-medium mb-3">Connected Accounts</h2>
        <div className="space-y-3">
          {accounts.length === 0 && (
            <p className="text-sm text-muted-foreground">No accounts connected yet.</p>
          )}
          {accounts.map((a) => (
            <div key={a.id} className="border border-border rounded-lg p-4 bg-card">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: a.color_label }} />
                  <div>
                    <p className="font-medium text-sm">{a.display_name || a.email_address}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.email_address} · {a.account_type}
                      {a.last_polled_at && ` · Last polled ${new Date(a.last_polled_at).toLocaleTimeString()}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {testStatus[a.id] === "ok" && <CheckCircle className="h-4 w-4 text-green-500" />}
                  {testStatus[a.id] === "fail" && <XCircle className="h-4 w-4 text-destructive" />}
                  <button onClick={() => handleTest(a.id)} title="Test connection" className="p-1.5 rounded hover:bg-accent">
                    <CheckCircle className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                  <button onClick={() => syncMutation.mutate(a.id)} title="Sync now" className="p-1.5 rounded hover:bg-accent">
                    <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                  <button onClick={() => deleteMutation.mutate(a.id)} className="p-1.5 rounded hover:bg-destructive/10">
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add account buttons */}
      <div>
        <h2 className="text-base font-medium mb-3">Add Account</h2>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setShowImapForm(!showImapForm)}
            className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-md text-sm hover:bg-accent transition-colors"
          >
            <Plus className="h-4 w-4" /> IMAP/SMTP Account
          </button>
          <a
            href={`${API_BASE}/oauth/gmail/start`}
            className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-md text-sm hover:bg-accent transition-colors"
          >
            <Plus className="h-4 w-4" /> Connect Gmail
          </a>
          <a
            href={`${API_BASE}/oauth/outlook/start`}
            className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-md text-sm hover:bg-accent transition-colors"
          >
            <Plus className="h-4 w-4" /> Connect Outlook
          </a>
        </div>
      </div>

      {/* IMAP form */}
      {showImapForm && (
        <div className="border border-border rounded-lg p-4 space-y-3 bg-card">
          <h3 className="font-medium text-sm">IMAP/SMTP Connection Details</h3>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Email address *</label>
              <input type="email" value={form.email_address} onChange={(e) => setForm({ ...form, email_address: e.target.value })}
                className="w-full border border-input rounded px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Password *</label>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full border border-input rounded px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Display name</label>
              <input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                className="w-full border border-input rounded px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Work Gmail" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Color label</label>
              <input type="color" value={form.color_label} onChange={(e) => setForm({ ...form, color_label: e.target.value })}
                className="h-9 w-full rounded border border-input cursor-pointer" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">IMAP host *</label>
              <input value={form.imap_host} onChange={(e) => setForm({ ...form, imap_host: e.target.value })}
                className="w-full border border-input rounded px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="imap.gmail.com" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">IMAP port</label>
              <input type="number" value={form.imap_port} onChange={(e) => setForm({ ...form, imap_port: +e.target.value })}
                className="w-full border border-input rounded px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">SMTP host *</label>
              <input value={form.smtp_host} onChange={(e) => setForm({ ...form, smtp_host: e.target.value })}
                className="w-full border border-input rounded px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="smtp.gmail.com" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">SMTP port</label>
              <input type="number" value={form.smtp_port} onChange={(e) => setForm({ ...form, smtp_port: +e.target.value })}
                className="w-full border border-input rounded px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => connectMutation.mutate()}
              disabled={!form.email_address || !form.password || !form.imap_host || !form.smtp_host || connectMutation.isPending}
              className="px-3 py-1.5 bg-primary text-primary-foreground text-sm rounded hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {connectMutation.isPending ? "Connecting..." : "Connect Account"}
            </button>
            <button onClick={() => setShowImapForm(false)} className="px-3 py-1.5 border border-border text-sm rounded hover:bg-accent transition-colors">
              Cancel
            </button>
          </div>

          {connectMutation.isError && (
            <p className="text-sm text-destructive">{(connectMutation.error as any)?.response?.data?.detail || "Connection failed"}</p>
          )}
        </div>
      )}
    </div>
  );
}
