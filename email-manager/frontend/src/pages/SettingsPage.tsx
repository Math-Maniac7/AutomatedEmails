import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle,
  ChevronDown,
  ChevronUp,
  LockKeyhole,
  Mail,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";
import {
  connectImapAccount,
  deleteAccount,
  listAccounts,
  syncAccount,
  testAccount,
} from "@/api/accounts";

type ProviderId = "gmail" | "outlook" | "yahoo" | "icloud" | "other";

type ProviderPreset = {
  id: ProviderId;
  name: string;
  description: string;
  imap_host: string;
  imap_port: number;
  imap_use_ssl: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_use_tls: boolean;
  color_label: string;
  passwordLabel: string;
  passwordHelp: string;
};

type MailboxForm = {
  email_address: string;
  password: string;
  display_name: string;
  imap_host: string;
  imap_port: number;
  imap_use_ssl: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_use_tls: boolean;
  color_label: string;
};

const PROVIDERS: ProviderPreset[] = [
  {
    id: "gmail",
    name: "Gmail",
    description: "Google Workspace and personal Gmail accounts",
    imap_host: "imap.gmail.com",
    imap_port: 993,
    imap_use_ssl: true,
    smtp_host: "smtp.gmail.com",
    smtp_port: 587,
    smtp_use_tls: true,
    color_label: "#d93025",
    passwordLabel: "App password",
    passwordHelp: "Use a Gmail App Password, not your regular Google password.",
  },
  {
    id: "outlook",
    name: "Outlook",
    description: "Outlook.com, Hotmail, Live, and many Microsoft 365 inboxes",
    imap_host: "outlook.office365.com",
    imap_port: 993,
    imap_use_ssl: true,
    smtp_host: "smtp.office365.com",
    smtp_port: 587,
    smtp_use_tls: true,
    color_label: "#0078d4",
    passwordLabel: "Email password",
    passwordHelp: "Use your mailbox password unless your organization requires an app password.",
  },
  {
    id: "yahoo",
    name: "Yahoo",
    description: "Yahoo Mail personal inboxes",
    imap_host: "imap.mail.yahoo.com",
    imap_port: 993,
    imap_use_ssl: true,
    smtp_host: "smtp.mail.yahoo.com",
    smtp_port: 587,
    smtp_use_tls: true,
    color_label: "#5f01d1",
    passwordLabel: "App password",
    passwordHelp: "Yahoo usually requires an app password for mail apps.",
  },
  {
    id: "icloud",
    name: "iCloud",
    description: "Apple iCloud Mail",
    imap_host: "imap.mail.me.com",
    imap_port: 993,
    imap_use_ssl: true,
    smtp_host: "smtp.mail.me.com",
    smtp_port: 587,
    smtp_use_tls: true,
    color_label: "#3b82f6",
    passwordLabel: "App-specific password",
    passwordHelp: "Use an Apple app-specific password, not your Apple ID password.",
  },
  {
    id: "other",
    name: "Other",
    description: "Custom domain or less common email provider",
    imap_host: "",
    imap_port: 993,
    imap_use_ssl: true,
    smtp_host: "",
    smtp_port: 587,
    smtp_use_tls: true,
    color_label: "#4b5563",
    passwordLabel: "Email password",
    passwordHelp: "If you are unsure, ask your email provider for IMAP and SMTP settings.",
  },
];

const PROVIDER_MAP = Object.fromEntries(PROVIDERS.map((provider) => [provider.id, provider]));

function buildForm(providerId: ProviderId): MailboxForm {
  const provider = PROVIDER_MAP[providerId];
  return {
    email_address: "",
    password: "",
    display_name: "",
    imap_host: provider.imap_host,
    imap_port: provider.imap_port,
    imap_use_ssl: provider.imap_use_ssl,
    smtp_host: provider.smtp_host,
    smtp_port: provider.smtp_port,
    smtp_use_tls: provider.smtp_use_tls,
    color_label: provider.color_label,
  };
}

export default function SettingsPage() {
  const qc = useQueryClient();
  const [showConnectFlow, setShowConnectFlow] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>("gmail");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [testStatus, setTestStatus] = useState<Record<string, "ok" | "fail">>({});
  const [accountActionMessage, setAccountActionMessage] = useState<Record<string, string>>({});
  const [form, setForm] = useState<MailboxForm>(() => buildForm("gmail"));

  useEffect(() => {
    setForm((prev) => ({
      ...buildForm(selectedProvider),
      email_address: prev.email_address,
      password: prev.password,
      display_name: prev.display_name,
    }));
    setShowAdvanced(selectedProvider === "other");
  }, [selectedProvider]);

  const { data: accounts = [] } = useQuery({ queryKey: ["accounts"], queryFn: listAccounts });

  const connectMutation = useMutation({
    mutationFn: () => connectImapAccount(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      setShowConnectFlow(false);
      setShowAdvanced(false);
      setSelectedProvider("gmail");
      setForm(buildForm("gmail"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAccount(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      setAccountActionMessage((current) => ({
        ...current,
        [id]: "Mailbox removed.",
      }));
    },
    onError: (_error, id) => {
      setAccountActionMessage((current) => ({
        ...current,
        [id]: "We could not remove this mailbox.",
      }));
    },
  });

  const syncMutation = useMutation({
    mutationFn: (id: string) => syncAccount(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["emails"] });
      setAccountActionMessage((current) => ({
        ...current,
        [id]: "Sync started. Check Inbox in a moment.",
      }));
    },
    onError: (_error, id) => {
      setAccountActionMessage((current) => ({
        ...current,
        [id]: "Sync failed. Check the backend log for details.",
      }));
    },
  });

  const activeProvider = PROVIDER_MAP[selectedProvider];
  const canSubmit =
    !!form.email_address &&
    !!form.password &&
    !!form.imap_host &&
    !!form.smtp_host &&
    !connectMutation.isPending;

  async function handleTest(id: string) {
    try {
      await testAccount(id);
      setTestStatus((current) => ({ ...current, [id]: "ok" }));
      setAccountActionMessage((current) => ({
        ...current,
        [id]: "Connection worked.",
      }));
    } catch {
      setTestStatus((current) => ({ ...current, [id]: "fail" }));
      setAccountActionMessage((current) => ({
        ...current,
        [id]: "Connection failed. Recheck the mailbox password.",
      }));
    }
  }

  function handleDelete(id: string, label: string) {
    if (!window.confirm(`Remove ${label}?`)) {
      return;
    }
    deleteMutation.mutate(id);
  }

  return (
    <div className="max-w-4xl space-y-8 p-6">
      <div>
        <h1 className="mb-1 text-xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Connect your email inbox, test the connection, and keep messages syncing.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <h2 className="text-base font-medium">Connect an email inbox</h2>
            <p className="text-sm text-muted-foreground">
              Pick your email provider and we will fill in the mailbox settings for you.
            </p>
          </div>
          <button
            onClick={() => setShowConnectFlow((visible) => !visible)}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            {showConnectFlow ? "Close setup" : "Add mailbox"}
          </button>
        </div>

        {showConnectFlow && (
          <div className="mt-6 space-y-6">
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-medium">Choose your email provider</h3>
                <p className="text-sm text-muted-foreground">
                  Most people should pick the service they already use for email.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {PROVIDERS.map((provider) => {
                  const selected = provider.id === selectedProvider;
                  return (
                    <button
                      key={provider.id}
                      onClick={() => setSelectedProvider(provider.id)}
                      className={`rounded-xl border p-4 text-left transition-colors ${
                        selected
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border hover:border-primary/50 hover:bg-accent/40"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{provider.name}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{provider.description}</p>
                        </div>
                        <span
                          className="mt-0.5 h-3 w-3 rounded-full"
                          style={{ backgroundColor: provider.color_label }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.3fr_0.9fr]">
              <div className="space-y-4 rounded-xl border border-border bg-background/60 p-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-medium">Sign in to your mailbox</h3>
                  <p className="text-sm text-muted-foreground">
                    We will use these details to read and send email from your inbox.
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs font-medium">Email address</label>
                    <input
                      type="email"
                      value={form.email_address}
                      onChange={(e) => setForm({ ...form, email_address: e.target.value })}
                      placeholder="you@example.com"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs font-medium">{activeProvider.passwordLabel}</label>
                    <input
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      placeholder={activeProvider.id === "gmail" ? "Paste your app password" : "Enter your password"}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs font-medium">Mailbox label</label>
                    <input
                      value={form.display_name}
                      onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                      placeholder={`${activeProvider.name} inbox`}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <p>{activeProvider.passwordHelp}</p>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-card p-3">
                  <button
                    onClick={() => setShowAdvanced((value) => !value)}
                    className="flex w-full items-center justify-between text-sm font-medium"
                  >
                    <span>Advanced mailbox settings</span>
                    {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>

                  {showAdvanced && (
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium">IMAP server</label>
                        <input
                          value={form.imap_host}
                          onChange={(e) => setForm({ ...form, imap_host: e.target.value })}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          placeholder="imap.example.com"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium">IMAP port</label>
                        <input
                          type="number"
                          value={form.imap_port}
                          onChange={(e) => setForm({ ...form, imap_port: Number(e.target.value) })}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium">SMTP server</label>
                        <input
                          value={form.smtp_host}
                          onChange={(e) => setForm({ ...form, smtp_host: e.target.value })}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          placeholder="smtp.example.com"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium">SMTP port</label>
                        <input
                          type="number"
                          value={form.smtp_port}
                          onChange={(e) => setForm({ ...form, smtp_port: Number(e.target.value) })}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => connectMutation.mutate()}
                    disabled={!canSubmit}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                  >
                    {connectMutation.isPending ? "Connecting..." : "Connect mailbox"}
                  </button>
                  <button
                    onClick={() => setShowConnectFlow(false)}
                    className="rounded-md border border-border px-4 py-2 text-sm transition-colors hover:bg-accent"
                  >
                    Cancel
                  </button>
                </div>

                {connectMutation.isError && (
                  <p className="text-sm text-destructive">
                    {(connectMutation.error as any)?.response?.data?.detail ||
                      "We could not connect to that mailbox. Double-check the email address and password."}
                  </p>
                )}
              </div>

              <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
                <div>
                  <h3 className="text-sm font-medium">What to expect</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Your inbox stays connected in the background so the app can sync incoming messages.
                  </p>
                </div>

                <div className="space-y-3 text-sm text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <Mail className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <p>Choose your provider and enter the email address you already use.</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <p>For Gmail, Yahoo, and iCloud, you will usually need an app password.</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <p>Use "Other" only if your provider is not listed or uses custom server settings.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-base font-medium">Connected inboxes</h2>
        <div className="space-y-3">
          {accounts.length === 0 && (
            <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-sm text-muted-foreground">
              No inboxes connected yet. Add your first mailbox above to start syncing email.
            </div>
          )}

          {accounts.map((account) => (
            <div key={account.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: account.color_label }} />
                  <div>
                    <p className="font-medium text-sm">{account.display_name || account.email_address}</p>
                    <p className="text-xs text-muted-foreground">
                      {account.email_address}
                      {account.last_polled_at &&
                        ` · Last synced ${new Date(account.last_polled_at).toLocaleTimeString()}`}
                    </p>
                    {accountActionMessage[account.id] && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {accountActionMessage[account.id]}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {testStatus[account.id] === "ok" && <CheckCircle className="h-4 w-4 text-green-500" />}
                  {testStatus[account.id] === "fail" && <XCircle className="h-4 w-4 text-destructive" />}

                  <button
                    onClick={() => handleTest(account.id)}
                    title="Test connection"
                    disabled={deleteMutation.isPending || syncMutation.isPending}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:bg-accent disabled:opacity-50"
                  >
                    <CheckCircle className="h-3.5 w-3.5 text-muted-foreground" />
                    Test
                  </button>

                  <button
                    onClick={() => syncMutation.mutate(account.id)}
                    title="Sync now"
                    disabled={deleteMutation.isPending}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:bg-accent disabled:opacity-50"
                  >
                    <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                    Sync
                  </button>

                  <button
                    onClick={() => handleDelete(account.id, account.display_name || account.email_address)}
                    title="Remove mailbox"
                    disabled={deleteMutation.isPending}
                    className="inline-flex items-center gap-1.5 rounded-md border border-destructive/30 px-3 py-1.5 text-sm text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
