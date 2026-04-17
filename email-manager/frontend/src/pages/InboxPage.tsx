import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { RefreshCw, Search, Star, Archive, Reply, X } from "lucide-react";
import { listEmails, getEmail, markRead, starEmail, archiveEmail, replyToEmail, EmailMessage } from "@/api/emails";
import { listAccounts } from "@/api/accounts";

export default function InboxPage() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterRead, setFilterRead] = useState<boolean | undefined>(undefined);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [replyText, setReplyText] = useState("");
  const [showReply, setShowReply] = useState(false);

  const { data: accounts = [] } = useQuery({ queryKey: ["accounts"], queryFn: listAccounts });

  const { data: emails = [], isLoading, refetch } = useQuery({
    queryKey: ["emails", search, filterRead, selectedAccounts.join(",")],
    queryFn: () =>
      listEmails({
        search: search || undefined,
        is_read: filterRead,
        account_ids: selectedAccounts.length ? selectedAccounts.join(",") : undefined,
      }),
  });

  const { data: detail } = useQuery({
    queryKey: ["email", selectedId],
    queryFn: () => getEmail(selectedId!),
    enabled: !!selectedId,
  });

  const markReadMutation = useMutation({
    mutationFn: ({ id, is_read }: { id: string; is_read: boolean }) => markRead(id, is_read),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["emails"] }),
  });

  const starMutation = useMutation({
    mutationFn: ({ id, is_starred }: { id: string; is_starred: boolean }) => starEmail(id, is_starred),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["emails"] }),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => archiveEmail(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["emails"] }); setSelectedId(null); },
  });

  const replyMutation = useMutation({
    mutationFn: () => replyToEmail(selectedId!, replyText),
    onSuccess: () => { setReplyText(""); setShowReply(false); },
  });

  function handleSelect(msg: EmailMessage) {
    setSelectedId(msg.id);
    setShowReply(false);
    if (!msg.is_read) markReadMutation.mutate({ id: msg.id, is_read: true });
  }

  function toggleAccount(id: string) {
    setSelectedAccounts((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  }

  return (
    <div className="flex h-full">
      {/* Email list */}
      <div className="w-80 border-r border-border flex flex-col">
        <div className="p-3 border-b border-border space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center border border-input rounded-md px-2 bg-background">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search emails..."
                className="flex-1 px-2 py-1.5 text-sm bg-transparent outline-none"
              />
            </div>
            <button onClick={() => refetch()} className="p-1.5 rounded hover:bg-accent">
              <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>

          {/* Account filter pills */}
          {accounts.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {accounts.map((a) => (
                <button
                  key={a.id}
                  onClick={() => toggleAccount(a.id)}
                  className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                    selectedAccounts.includes(a.id)
                      ? "text-white border-transparent"
                      : "border-border text-muted-foreground hover:border-primary"
                  }`}
                  style={selectedAccounts.includes(a.id) ? { backgroundColor: a.color_label } : {}}
                >
                  {a.display_name || a.email_address}
                </button>
              ))}
            </div>
          )}

          {/* Read filter */}
          <div className="flex gap-2 text-xs">
            <button
              onClick={() => setFilterRead(undefined)}
              className={`px-2 py-0.5 rounded ${filterRead === undefined ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}
            >
              All
            </button>
            <button
              onClick={() => setFilterRead(false)}
              className={`px-2 py-0.5 rounded ${filterRead === false ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}
            >
              Unread
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {isLoading && <p className="p-4 text-sm text-muted-foreground">Loading...</p>}
          {!isLoading && emails.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">No emails found</p>
          )}
          {emails.map((msg) => {
            const account = accounts.find((a) => a.id === msg.email_account_id);
            return (
              <button
                key={msg.id}
                onClick={() => handleSelect(msg)}
                className={`w-full text-left px-3 py-3 border-b border-border hover:bg-accent/50 transition-colors ${
                  selectedId === msg.id ? "bg-accent" : ""
                } ${!msg.is_read ? "font-medium" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm truncate">{msg.from_name || msg.from_address}</span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(new Date(msg.received_at), { addSuffix: true })}
                  </span>
                </div>
                <p className="text-sm truncate mt-0.5">{msg.subject || "(no subject)"}</p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{msg.snippet}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  {account && (
                    <span
                      className="text-xs px-1.5 py-0.5 rounded-full text-white"
                      style={{ backgroundColor: account.color_label }}
                    >
                      {account.display_name || account.email_address}
                    </span>
                  )}
                  {msg.auto_replied && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">Auto-replied</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Email detail */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!detail ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Select an email to read
          </div>
        ) : (
          <>
            <div className="p-4 border-b border-border">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-semibold text-lg">{detail.subject || "(no subject)"}</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    From <span className="font-medium text-foreground">{detail.from_name || detail.from_address}</span>
                    {" · "}{new Date(detail.received_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setShowReply(!showReply)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-md hover:bg-accent transition-colors"
                  >
                    <Reply className="h-3.5 w-3.5" /> Reply
                  </button>
                  <button
                    onClick={() => starMutation.mutate({ id: detail.id, is_starred: true })}
                    className="p-1.5 rounded hover:bg-accent"
                  >
                    <Star className="h-4 w-4 text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => archiveMutation.mutate(detail.id)}
                    className="p-1.5 rounded hover:bg-accent"
                  >
                    <Archive className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-6">
              {detail.body_html ? (
                <iframe
                  srcDoc={detail.body_html}
                  className="w-full h-full border-0"
                  sandbox="allow-same-origin"
                  title="email-body"
                />
              ) : (
                <pre className="text-sm whitespace-pre-wrap font-sans">{detail.body_text}</pre>
              )}
            </div>

            {showReply && (
              <div className="border-t border-border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Reply to {detail.from_address}</span>
                  <button onClick={() => setShowReply(false)}>
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  rows={5}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  placeholder="Write your reply..."
                />
                <button
                  onClick={() => replyMutation.mutate()}
                  disabled={!replyText.trim() || replyMutation.isPending}
                  className="px-4 py-2 bg-primary text-primary-foreground text-sm rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {replyMutation.isPending ? "Sending..." : "Send Reply"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
