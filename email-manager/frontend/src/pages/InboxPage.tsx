import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, format } from "date-fns";
import {
  Archive,
  Inbox,
  Mail,
  RefreshCw,
  Reply,
  Search,
  Star,
  X,
  Loader2,
  AlertCircle,
  ChevronDown,
} from "lucide-react";
import {
  listEmails,
  getEmail,
  markRead,
  starEmail,
  archiveEmail,
  replyToEmail,
  type EmailMessage,
} from "@/api/emails";
import { listAccounts, syncAccount } from "@/api/accounts";

// ─── helpers ────────────────────────────────────────────────────────────────

function initials(name: string | null | undefined, fallback: string) {
  if (!name) return fallback.slice(0, 2).toUpperCase();
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// ─── sub-components ─────────────────────────────────────────────────────────

function EmptyNoAccounts() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 p-10 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
        <Mail className="h-9 w-9 text-primary" />
      </div>
      <div>
        <h2 className="text-xl font-semibold">No inbox connected yet</h2>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
          Connect your first email account and your messages will appear here automatically.
        </p>
      </div>
      <button
        onClick={() => navigate("/settings")}
        className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Add email account
      </button>
    </div>
  );
}

function EmptyNoEmails({ onSync, syncing }: { onSync: () => void; syncing: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 p-10 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
        <Inbox className="h-9 w-9 text-muted-foreground" />
      </div>
      <div>
        <h2 className="text-xl font-semibold">Your inbox is empty</h2>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
          No emails found. Try syncing your account to check for new messages.
        </p>
      </div>
      <button
        onClick={onSync}
        disabled={syncing}
        className="flex items-center gap-2 rounded-lg border border-border px-5 py-2.5 text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50"
      >
        <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
        {syncing ? "Syncing…" : "Sync now"}
      </button>
    </div>
  );
}

function SelectPrompt() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center p-10">
      <Mail className="h-10 w-10 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">Select an email to read it</p>
    </div>
  );
}

// ─── main page ───────────────────────────────────────────────────────────────

export default function InboxPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  // UI state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterRead, setFilterRead] = useState<boolean | undefined>(undefined);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [replyText, setReplyText] = useState("");
  const [showReply, setShowReply] = useState(false);
  const [showPlainText, setShowPlainText] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Data
  const { data: accounts = [], isLoading: loadingAccounts } = useQuery({
    queryKey: ["accounts"],
    queryFn: listAccounts,
  });

  const {
    data: emails = [],
    isLoading: loadingEmails,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["emails", search, filterRead, selectedAccounts.join(",")],
    queryFn: () =>
      listEmails({
        search: search || undefined,
        is_read: filterRead,
        account_ids: selectedAccounts.length ? selectedAccounts.join(",") : undefined,
      }),
    enabled: accounts.length > 0,
  });

  const { data: detail, isLoading: loadingDetail } = useQuery({
    queryKey: ["email", selectedId],
    queryFn: () => getEmail(selectedId!),
    enabled: !!selectedId,
  });

  // Mutations
  const markReadMutation = useMutation({
    mutationFn: ({ id, is_read }: { id: string; is_read: boolean }) => markRead(id, is_read),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["emails"] }),
  });

  const starMutation = useMutation({
    mutationFn: (id: string) => starEmail(id, true),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["emails"] }),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => archiveEmail(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["emails"] });
      setSelectedId(null);
      setShowReply(false);
    },
  });

  const replyMutation = useMutation({
    mutationFn: () => replyToEmail(selectedId!, replyText),
    onSuccess: () => {
      setReplyText("");
      setShowReply(false);
    },
  });

  // Handlers
  function handleSelect(msg: EmailMessage) {
    setSelectedId(msg.id);
    setShowReply(false);
    setShowPlainText(false);
    if (!msg.is_read) markReadMutation.mutate({ id: msg.id, is_read: true });
  }

  function toggleAccount(id: string) {
    setSelectedAccounts((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  }

  async function handleSyncAll() {
    setSyncing(true);
    try {
      await Promise.all(accounts.map((a) => syncAccount(a.id).catch(() => null)));
      await qc.invalidateQueries({ queryKey: ["emails"] });
    } finally {
      setSyncing(false);
    }
  }

  // ─── render decisions ─────────────────────────────────────────────────────

  const isLoading = loadingAccounts || loadingEmails;
  const noAccounts = !loadingAccounts && accounts.length === 0;

  if (noAccounts) {
    return (
      <div className="flex h-full">
        <EmptyNoAccounts />
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left panel: list ───────────────────────────────────────────── */}
      <div className="flex w-80 flex-col border-r border-border">
        {/* Toolbar */}
        <div className="space-y-2 border-b border-border p-3">
          {/* Search */}
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-md border border-input bg-background px-2.5 py-1.5">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search emails…"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              {search && (
                <button onClick={() => setSearch("")}>
                  <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>
            <button
              onClick={handleSyncAll}
              disabled={syncing}
              title="Sync now"
              className="rounded-md p-1.5 hover:bg-accent transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-muted-foreground ${syncing ? "animate-spin" : ""}`} />
            </button>
          </div>

          {/* Account pills */}
          {accounts.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {accounts.map((a) => {
                const active = selectedAccounts.includes(a.id);
                return (
                  <button
                    key={a.id}
                    onClick={() => toggleAccount(a.id)}
                    className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                      active
                        ? "border-transparent text-white"
                        : "border-border text-muted-foreground hover:border-primary/50"
                    }`}
                    style={active ? { backgroundColor: a.color_label } : {}}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: active ? "white" : a.color_label }}
                    />
                    {a.display_name || a.email_address.split("@")[0]}
                  </button>
                );
              })}
            </div>
          )}

          {/* Read filter */}
          <div className="flex gap-1 text-xs">
            {(
              [
                [undefined, "All"],
                [false, "Unread"],
                [true, "Read"],
              ] as [boolean | undefined, string][]
            ).map(([val, label]) => (
              <button
                key={String(val)}
                onClick={() => setFilterRead(val)}
                className={`rounded px-2.5 py-1 transition-colors ${
                  filterRead === val
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Email list */}
        <div className="flex-1 overflow-auto">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          )}

          {isError && (
            <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-destructive">
              <AlertCircle className="h-5 w-5" />
              <p>Could not load emails. Is the server running?</p>
              <button onClick={() => refetch()} className="text-primary underline underline-offset-2">
                Retry
              </button>
            </div>
          )}

          {!isLoading && !isError && emails.length === 0 && (
            <EmptyNoEmails onSync={handleSyncAll} syncing={syncing} />
          )}

          {emails.map((msg) => {
            const account = accounts.find((a) => a.id === msg.email_account_id);
            const isSelected = selectedId === msg.id;
            return (
              <button
                key={msg.id}
                onClick={() => handleSelect(msg)}
                className={`group relative w-full border-b border-border px-3 py-3 text-left transition-colors hover:bg-accent/60 ${
                  isSelected ? "bg-accent" : ""
                }`}
              >
                {/* Unread indicator */}
                {!msg.is_read && (
                  <span className="absolute left-0 top-0 h-full w-0.5 rounded-r bg-primary" />
                )}

                <div className="flex items-start gap-2.5">
                  {/* Avatar */}
                  <div
                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: account?.color_label ?? "#6366f1" }}
                  >
                    {initials(msg.from_name, msg.from_address)}
                  </div>

                  <div className="min-w-0 flex-1">
                    {/* Row 1: sender + time */}
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`truncate text-sm ${!msg.is_read ? "font-semibold" : "font-medium"}`}>
                        {msg.from_name || msg.from_address}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(msg.received_at), { addSuffix: true })}
                      </span>
                    </div>
                    {/* Row 2: subject */}
                    <p className={`truncate text-sm ${!msg.is_read ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                      {msg.subject || "(no subject)"}
                    </p>
                    {/* Row 3: snippet */}
                    <p className="truncate text-xs text-muted-foreground">{msg.snippet}</p>
                    {/* Row 4: badges */}
                    <div className="mt-1 flex flex-wrap gap-1">
                      {msg.auto_replied && (
                        <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">
                          Auto-replied
                        </span>
                      )}
                      {msg.has_attachments && (
                        <span className="rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground">
                          📎
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Right panel: detail ────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {!selectedId ? (
          <SelectPrompt />
        ) : loadingDetail ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : detail ? (
          <>
            {/* Header */}
            <div className="shrink-0 space-y-1 border-b border-border p-5">
              <h2 className="text-lg font-semibold leading-snug">
                {detail.subject || "(no subject)"}
              </h2>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
                <span>
                  <span className="font-medium text-foreground">
                    {detail.from_name || detail.from_address}
                  </span>
                  {detail.from_name && (
                    <span className="ml-1 text-xs">&lt;{detail.from_address}&gt;</span>
                  )}
                </span>
                <span>·</span>
                <span>{format(new Date(detail.received_at), "MMM d, yyyy · h:mm a")}</span>
              </div>
              {/* Action bar */}
              <div className="flex items-center gap-1.5 pt-2">
                <button
                  onClick={() => setShowReply(!showReply)}
                  className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors"
                >
                  <Reply className="h-3.5 w-3.5" /> Reply
                </button>
                <button
                  onClick={() => starMutation.mutate(detail.id)}
                  title="Star"
                  className="rounded-md p-1.5 hover:bg-accent transition-colors"
                >
                  <Star className="h-4 w-4 text-muted-foreground hover:text-yellow-500" />
                </button>
                <button
                  onClick={() => archiveMutation.mutate(detail.id)}
                  title="Archive"
                  className="rounded-md p-1.5 hover:bg-accent transition-colors"
                >
                  <Archive className="h-4 w-4 text-muted-foreground" />
                </button>
                <button
                  onClick={() => markReadMutation.mutate({ id: detail.id, is_read: !detail.is_read })}
                  className="ml-auto text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                >
                  Mark as {detail.is_read ? "unread" : "read"}
                </button>
                {detail.body_html && (
                  <button
                    onClick={() => setShowPlainText(!showPlainText)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                  >
                    {showPlainText ? "Show formatted" : "Show plain text"}
                    <ChevronDown className={`h-3 w-3 transition-transform ${showPlainText ? "rotate-180" : ""}`} />
                  </button>
                )}
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-auto">
              {showPlainText || !detail.body_html ? (
                <pre className="whitespace-pre-wrap p-6 font-sans text-sm leading-relaxed">
                  {detail.body_text || "(no content)"}
                </pre>
              ) : (
                <iframe
                  srcDoc={detail.body_html}
                  className="h-full w-full border-0"
                  sandbox="allow-same-origin"
                  title="Email body"
                />
              )}
            </div>

            {/* Reply box */}
            {showReply && (
              <div className="shrink-0 border-t border-border bg-muted/30 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-muted-foreground">
                    Replying to{" "}
                    <span className="text-foreground">{detail.from_name || detail.from_address}</span>
                  </p>
                  <button onClick={() => setShowReply(false)} className="rounded p-1 hover:bg-accent">
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
                <textarea
                  autoFocus
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  rows={5}
                  placeholder="Write your reply…"
                  className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => replyMutation.mutate()}
                    disabled={!replyText.trim() || replyMutation.isPending}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {replyMutation.isPending ? "Sending…" : "Send reply"}
                  </button>
                  <button
                    onClick={() => { setShowReply(false); setReplyText(""); }}
                    className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent transition-colors"
                  >
                    Cancel
                  </button>
                </div>
                {replyMutation.isError && (
                  <p className="text-xs text-destructive">Failed to send reply. Please try again.</p>
                )}
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
