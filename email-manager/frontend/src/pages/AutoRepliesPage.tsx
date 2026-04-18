import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  Bot,
  Building2,
  ChevronRight,
  FileText,
  FlaskConical,
  Loader2,
  Mail,
  MailCheck,
  MailOpen,
  MessageSquarePlus,
  Plus,
  Search,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Trash2,
  User,
  Zap,
} from "lucide-react";
import {
  listRules,
  createRule,
  deleteRule,
  toggleRule,
  testRule,
  getReplyLog,
  type AutoReplyRule,
} from "@/api/autoReplies";
import { listTemplates } from "@/api/templates";

// ─── human-readable maps ─────────────────────────────────────────────────────

const TRIGGERS = [
  {
    value: "keyword",
    icon: Mail,
    label: "Email contains keywords",
    description: "Triggers when the email body or subject includes specific words",
    color: "text-blue-600 bg-blue-50 border-blue-200",
  },
  {
    value: "sender_domain",
    icon: Building2,
    label: "From a specific company",
    description: "Triggers when the sender's email domain matches (e.g. @acme.com)",
    color: "text-orange-600 bg-orange-50 border-orange-200",
  },
  {
    value: "sender_email",
    icon: User,
    label: "From a specific person",
    description: "Triggers when the email is from one exact email address",
    color: "text-violet-600 bg-violet-50 border-violet-200",
  },
  {
    value: "subject_contains",
    icon: Search,
    label: "Subject line contains",
    description: "Triggers when the subject includes a specific phrase",
    color: "text-teal-600 bg-teal-50 border-teal-200",
  },
  {
    value: "any_email",
    icon: MailOpen,
    label: "All incoming emails",
    description: "Triggers for every new email you receive (set a rate limit below)",
    color: "text-slate-600 bg-slate-50 border-slate-200",
  },
  {
    value: "ai_classified",
    icon: Bot,
    label: "AI decides",
    description: "Let Claude read each email and decide whether this rule applies",
    color: "text-purple-600 bg-purple-50 border-purple-200",
  },
] as const;

const ACTIONS = [
  {
    value: "use_template",
    icon: FileText,
    label: "Send a saved template",
    description: "Pick one of your templates — it will be sent automatically, word for word",
    color: "text-green-600 bg-green-50 border-green-200",
  },
  {
    value: "ai_select_template",
    icon: Search,
    label: "AI picks the best template",
    description: "Claude reads the email and chooses which of your templates fits best",
    color: "text-blue-600 bg-blue-50 border-blue-200",
  },
  {
    value: "ai_generate",
    icon: Sparkles,
    label: "AI writes a fresh reply",
    description: "Claude writes a unique, personalised reply following your instructions",
    color: "text-purple-600 bg-purple-50 border-purple-200",
  },
] as const;

type TriggerValue = (typeof TRIGGERS)[number]["value"];
type ActionValue = (typeof ACTIONS)[number]["value"];

// ─── helpers ─────────────────────────────────────────────────────────────────

function triggerLabel(value: string) {
  return TRIGGERS.find((t) => t.value === value)?.label ?? value;
}

function actionLabel(value: string) {
  return ACTIONS.find((a) => a.value === value)?.label ?? value;
}

function ruleSummary(rule: AutoReplyRule, templateName?: string): string {
  const trigger = triggerLabel(rule.trigger_type);
  const action = actionLabel(rule.action_type);
  let when = trigger;
  if (rule.trigger_type === "keyword" && rule.keywords.length) {
    when = `Email contains "${rule.keywords.slice(0, 2).join('", "')}"${rule.keywords.length > 2 ? "…" : ""}`;
  } else if (rule.trigger_type === "sender_domain" && rule.sender_filter) {
    when = `Email from ${rule.sender_filter}`;
  } else if (rule.trigger_type === "sender_email" && rule.sender_filter) {
    when = `Email from ${rule.sender_filter}`;
  } else if (rule.trigger_type === "subject_contains" && rule.subject_filter) {
    when = `Subject contains "${rule.subject_filter}"`;
  }

  let then = action;
  if (rule.action_type === "use_template" && templateName) {
    then = `Send template "${templateName}"`;
  }
  return `${when}  →  ${then}`;
}

// ─── wizard step indicator ───────────────────────────────────────────────────

function StepIndicator({ step, current }: { step: number; current: number }) {
  const done = current > step;
  const active = current === step;
  return (
    <div className="flex items-center gap-1.5">
      <div
        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-colors ${
          done
            ? "bg-primary text-primary-foreground"
            : active
            ? "border-2 border-primary text-primary"
            : "border-2 border-border text-muted-foreground"
        }`}
      >
        {done ? "✓" : step}
      </div>
      <span
        className={`text-xs font-medium ${
          active ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        {step === 1 ? "When?" : step === 2 ? "What?" : "Details"}
      </span>
    </div>
  );
}

// ─── selection card ───────────────────────────────────────────────────────────

function SelectionCard({
  icon: Icon,
  label,
  description,
  color,
  selected,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  description: string;
  color: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-start gap-3 rounded-xl border-2 p-4 text-left transition-all ${
        selected
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-border hover:border-primary/30 hover:bg-accent/50"
      }`}
    >
      <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      {selected && (
        <div className="ml-auto shrink-0">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">
            ✓
          </div>
        </div>
      )}
    </button>
  );
}

// ─── main page ───────────────────────────────────────────────────────────────

export default function AutoRepliesPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"rules" | "log">("rules");
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);

  // Wizard form state
  const [triggerType, setTriggerType] = useState<TriggerValue>("keyword");
  const [actionType, setActionType] = useState<ActionValue>("use_template");
  const [ruleName, setRuleName] = useState("");
  const [keywords, setKeywords] = useState("");
  const [senderFilter, setSenderFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [aiInstructions, setAiInstructions] = useState("");
  const [maxReplies, setMaxReplies] = useState(1);
  const [cooldownHours, setCooldownHours] = useState(24);

  // Test panel state
  const [testingRuleId, setTestingRuleId] = useState<string | null>(null);
  const [testInput, setTestInput] = useState({ subject: "", body: "", from: "test@example.com" });
  const [testResult, setTestResult] = useState<{ matched: boolean; rule_name: string } | null>(null);

  const { data: rules = [], isLoading: loadingRules } = useQuery({
    queryKey: ["rules"],
    queryFn: listRules,
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["templates"],
    queryFn: listTemplates,
  });

  const { data: log = [], isLoading: loadingLog } = useQuery({
    queryKey: ["reply-log"],
    queryFn: () => getReplyLog(),
    enabled: tab === "log",
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createRule({
        name: ruleName || `${triggerLabel(triggerType)} rule`,
        trigger_type: triggerType,
        action_type: actionType,
        keywords: keywords ? keywords.split(",").map((k) => k.trim()).filter(Boolean) : [],
        sender_filter: senderFilter || undefined,
        subject_filter: subjectFilter || undefined,
        template_id: selectedTemplateId || undefined,
        ai_instructions: aiInstructions || undefined,
        max_replies_per_sender_per_day: maxReplies,
        cooldown_hours: cooldownHours,
        is_active: true,
        priority: 100,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rules"] });
      closeWizard();
    },
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
    mutationFn: (ruleId: string) =>
      testRule({
        rule_id: ruleId,
        sample_subject: testInput.subject,
        sample_body: testInput.body,
        sample_from: testInput.from,
      }),
    onSuccess: (data) => setTestResult(data),
  });

  function closeWizard() {
    setShowWizard(false);
    setWizardStep(1);
    setRuleName("");
    setKeywords("");
    setSenderFilter("");
    setSubjectFilter("");
    setSelectedTemplateId("");
    setAiInstructions("");
    setMaxReplies(1);
    setCooldownHours(24);
    setTriggerType("keyword");
    setActionType("use_template");
  }

  function openTest(rule: AutoReplyRule) {
    setTestingRuleId(testingRuleId === rule.id ? null : rule.id);
    setTestResult(null);
    setTestInput({ subject: "", body: "", from: "test@example.com" });
  }

  // ─── wizard step validation ───────────────────────────────────────────────
  const step3Valid =
    (triggerType === "keyword" ? keywords.trim().length > 0 : true) &&
    (triggerType === "sender_domain" || triggerType === "sender_email"
      ? senderFilter.trim().length > 0
      : true) &&
    (triggerType === "subject_contains" ? subjectFilter.trim().length > 0 : true) &&
    (actionType === "use_template" ? selectedTemplateId.length > 0 : true);

  return (
    <div className="flex h-full flex-col overflow-auto p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Auto-Replies</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Set up rules so emails get answered automatically — no action needed from you.
          </p>
        </div>
        {!showWizard && (
          <button
            onClick={() => { setShowWizard(true); setWizardStep(1); }}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" /> New rule
          </button>
        )}
      </div>

      {/* ── Wizard ────────────────────────────────────────────────────────── */}
      {showWizard && (
        <div className="mb-8 rounded-2xl border border-border bg-card p-6 shadow-sm">
          {/* Step indicator */}
          <div className="mb-6 flex items-center gap-4">
            <StepIndicator step={1} current={wizardStep} />
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <StepIndicator step={2} current={wizardStep} />
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <StepIndicator step={3} current={wizardStep} />
          </div>

          {/* Step 1: trigger */}
          {wizardStep === 1 && (
            <div>
              <h3 className="mb-1 text-base font-semibold">When should this rule activate?</h3>
              <p className="mb-4 text-sm text-muted-foreground">
                Choose what kind of email should trigger an automatic reply.
              </p>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {TRIGGERS.map((t) => (
                  <SelectionCard
                    key={t.value}
                    icon={t.icon}
                    label={t.label}
                    description={t.description}
                    color={t.color}
                    selected={triggerType === t.value}
                    onClick={() => setTriggerType(t.value)}
                  />
                ))}
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={closeWizard}
                  className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setWizardStep(2)}
                  className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Step 2: action */}
          {wizardStep === 2 && (
            <div>
              <h3 className="mb-1 text-base font-semibold">What should happen?</h3>
              <p className="mb-4 text-sm text-muted-foreground">
                Choose what kind of reply to send when this rule matches.
              </p>
              <div className="grid gap-2.5 sm:grid-cols-3">
                {ACTIONS.map((a) => (
                  <SelectionCard
                    key={a.value}
                    icon={a.icon}
                    label={a.label}
                    description={a.description}
                    color={a.color}
                    selected={actionType === a.value}
                    onClick={() => setActionType(a.value)}
                  />
                ))}
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={() => setWizardStep(1)}
                  className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => setWizardStep(3)}
                  className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Step 3: details */}
          {wizardStep === 3 && (
            <div className="space-y-4">
              <div>
                <h3 className="mb-1 text-base font-semibold">Fill in the details</h3>
                <p className="text-sm text-muted-foreground">
                  A few more settings to make this rule work exactly how you want.
                </p>
              </div>

              {/* Rule name */}
              <div>
                <label className="mb-1 block text-sm font-medium">Rule name (optional)</label>
                <input
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  placeholder={`${triggerLabel(triggerType)} → ${actionLabel(actionType)}`}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Trigger-specific fields */}
              {triggerType === "keyword" && (
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Keywords <span className="text-destructive">*</span>
                  </label>
                  <p className="mb-1.5 text-xs text-muted-foreground">
                    Separate multiple keywords with commas. The rule triggers when any of them appear.
                  </p>
                  <input
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                    placeholder="invoice, payment, receipt, quote"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              )}

              {(triggerType === "sender_domain" || triggerType === "sender_email") && (
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    {triggerType === "sender_domain" ? "Company domain" : "Email address"}{" "}
                    <span className="text-destructive">*</span>
                  </label>
                  <input
                    value={senderFilter}
                    onChange={(e) => setSenderFilter(e.target.value)}
                    placeholder={triggerType === "sender_domain" ? "@acme.com" : "boss@company.com"}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              )}

              {triggerType === "subject_contains" && (
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Subject phrase <span className="text-destructive">*</span>
                  </label>
                  <input
                    value={subjectFilter}
                    onChange={(e) => setSubjectFilter(e.target.value)}
                    placeholder="Urgent: …"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              )}

              {/* Action-specific fields */}
              {actionType === "use_template" && (
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Template to send <span className="text-destructive">*</span>
                  </label>
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Choose a template…</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  {templates.length === 0 && (
                    <p className="mt-1.5 text-xs text-destructive">
                      You don't have any templates yet.{" "}
                      <a href="/templates" className="underline">
                        Create one first.
                      </a>
                    </p>
                  )}
                </div>
              )}

              {(actionType === "ai_generate" || actionType === "ai_select_template") && (
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Instructions for the AI{" "}
                    {actionType === "ai_generate" && <span className="text-destructive">*</span>}
                  </label>
                  <p className="mb-1.5 text-xs text-muted-foreground">
                    {actionType === "ai_generate"
                      ? "Tell the AI how to respond — tone, what to say, what to ask for, etc."
                      : "Optional hints to help the AI pick the right template."}
                  </p>
                  <textarea
                    value={aiInstructions}
                    onChange={(e) => setAiInstructions(e.target.value)}
                    rows={3}
                    placeholder={
                      actionType === "ai_generate"
                        ? "Reply professionally and confirm we received their message. Ask them to allow 2 business days for a response."
                        : "This account handles billing questions."
                    }
                    className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              )}

              {/* Rate limiting */}
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <p className="mb-3 text-sm font-medium">Limits (to prevent spam)</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      Max auto-replies per sender per day
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={maxReplies}
                      onChange={(e) => setMaxReplies(+e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      Wait at least this many hours between replies
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={cooldownHours}
                      onChange={(e) => setCooldownHours(+e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setWizardStep(2)}
                  className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => createMutation.mutate()}
                  disabled={!step3Valid || createMutation.isPending}
                  className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {createMutation.isPending ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Creating…</>
                  ) : (
                    <><Zap className="h-3.5 w-3.5" /> Create rule</>
                  )}
                </button>
              </div>
              {createMutation.isError && (
                <p className="text-xs text-destructive">Something went wrong — please try again.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <div className="mb-5 flex gap-1 border-b border-border">
        {(["rules", "log"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 pb-2.5 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "rules" ? `Rules (${rules.length})` : "Reply Log"}
          </button>
        ))}
      </div>

      {/* ── Rules list ────────────────────────────────────────────────────── */}
      {tab === "rules" && (
        <div className="space-y-3">
          {loadingRules && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading rules…
            </div>
          )}

          {!loadingRules && rules.length === 0 && !showWizard && (
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border p-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <Zap className="h-7 w-7 text-primary" />
              </div>
              <div>
                <p className="font-semibold">No auto-reply rules yet</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Create your first rule and your inbox will start handling routine messages on its own.
                </p>
              </div>
              <button
                onClick={() => { setShowWizard(true); setWizardStep(1); }}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Plus className="h-4 w-4" /> Create first rule
              </button>
            </div>
          )}

          {rules.map((rule) => {
            const templateName = templates.find((t) => t.id === rule.template_id)?.name;
            const triggerMeta = TRIGGERS.find((t) => t.value === rule.trigger_type);
            const actionMeta = ACTIONS.find((a) => a.value === rule.action_type);
            const TIcon = triggerMeta?.icon ?? Mail;
            const AIcon = actionMeta?.icon ?? FileText;
            const isTestOpen = testingRuleId === rule.id;

            return (
              <div
                key={rule.id}
                className={`rounded-xl border bg-card transition-shadow ${
                  rule.is_active ? "border-border" : "border-border/50 opacity-60"
                }`}
              >
                <div className="flex items-start gap-4 p-4">
                  {/* Icons */}
                  <div className="mt-0.5 flex shrink-0 items-center gap-1.5">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg border ${triggerMeta?.color ?? ""}`}>
                      <TIcon className="h-4 w-4" />
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg border ${actionMeta?.color ?? ""}`}>
                      <AIcon className="h-4 w-4" />
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{rule.name}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          rule.is_active
                            ? "bg-green-100 text-green-700"
                            : "bg-secondary text-secondary-foreground"
                        }`}
                      >
                        {rule.is_active ? "Active" : "Paused"}
                      </span>
                      <span className="text-xs text-muted-foreground">Priority {rule.priority}</span>
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">{ruleSummary(rule, templateName)}</p>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>Max {rule.max_replies_per_sender_per_day}/day per sender</span>
                      <span>·</span>
                      <span>{rule.cooldown_hours}h cooldown</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => openTest(rule)}
                      title="Test this rule"
                      className={`rounded-md p-1.5 transition-colors ${
                        isTestOpen ? "bg-primary/10 text-primary" : "hover:bg-accent text-muted-foreground"
                      }`}
                    >
                      <FlaskConical className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => toggleMutation.mutate(rule.id)}
                      title={rule.is_active ? "Pause rule" : "Activate rule"}
                      className="rounded-md p-1.5 hover:bg-accent transition-colors"
                    >
                      {rule.is_active ? (
                        <ToggleRight className="h-5 w-5 text-primary" />
                      ) : (
                        <ToggleLeft className="h-5 w-5 text-muted-foreground" />
                      )}
                    </button>
                    <button
                      onClick={() => { if (confirm(`Delete "${rule.name}"?`)) deleteMutation.mutate(rule.id); }}
                      title="Delete rule"
                      className="rounded-md p-1.5 hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </button>
                  </div>
                </div>

                {/* Inline test panel */}
                {isTestOpen && (
                  <div className="border-t border-border bg-muted/30 px-4 py-3 space-y-3">
                    <p className="text-sm font-medium">
                      Test this rule — would it fire for this email?
                    </p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">From (email address)</label>
                        <input
                          value={testInput.from}
                          onChange={(e) => setTestInput({ ...testInput, from: e.target.value })}
                          className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">Subject</label>
                        <input
                          value={testInput.subject}
                          onChange={(e) => setTestInput({ ...testInput, subject: e.target.value })}
                          placeholder="Invoice attached for April"
                          className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">Body (first few words)</label>
                        <input
                          value={testInput.body}
                          onChange={(e) => setTestInput({ ...testInput, body: e.target.value })}
                          placeholder="Please find attached…"
                          className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => testMutation.mutate(rule.id)}
                        disabled={testMutation.isPending}
                        className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                      >
                        {testMutation.isPending ? (
                          <><Loader2 className="h-3 w-3 animate-spin" /> Testing…</>
                        ) : (
                          <><FlaskConical className="h-3 w-3" /> Run test</>
                        )}
                      </button>
                      {testResult && (
                        <div
                          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ${
                            testResult.matched
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {testResult.matched ? (
                            <><MailCheck className="h-3.5 w-3.5" /> This rule <strong>would fire</strong></>
                          ) : (
                            <><Mail className="h-3.5 w-3.5" /> This rule <strong>would NOT fire</strong></>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Reply log ─────────────────────────────────────────────────────── */}
      {tab === "log" && (
        <div className="space-y-2">
          {loadingLog && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading log…
            </div>
          )}
          {!loadingLog && log.length === 0 && (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-12 text-center">
              <MessageSquarePlus className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                No auto-replies have been sent yet. Once a rule fires, every reply will be logged here.
              </p>
            </div>
          )}
          {log.map((entry) => {
            const templateName = templates.find((t) => t.id === entry.template_used_id)?.name;
            const ruleName = rules.find((r) => r.id === entry.rule_id)?.name;
            return (
              <div key={entry.id} className="flex items-start gap-4 rounded-xl border border-border bg-card p-4">
                <div
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    entry.status === "sent"
                      ? "bg-green-100"
                      : entry.status === "skipped"
                      ? "bg-yellow-100"
                      : "bg-red-100"
                  }`}
                >
                  {entry.status === "sent" ? (
                    <MailCheck className="h-4 w-4 text-green-600" />
                  ) : entry.status === "skipped" ? (
                    <Mail className="h-4 w-4 text-yellow-600" />
                  ) : (
                    <Mail className="h-4 w-4 text-red-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        entry.status === "sent"
                          ? "bg-green-100 text-green-700"
                          : entry.status === "skipped"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {entry.status === "sent"
                        ? "Sent"
                        : entry.status === "skipped"
                        ? "Skipped (rate limit)"
                        : "Failed"}
                    </span>
                    <span className="text-sm font-medium">
                      {entry.recipient_email ?? "Unknown recipient"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                    {ruleName && <> · Rule: <span className="text-foreground">{ruleName}</span></>}
                    {templateName && <> · Template: <span className="text-foreground">{templateName}</span></>}
                    {entry.ai_model_used && <> · AI-generated</>}
                  </p>
                  {entry.error_message && (
                    <p className="mt-1 text-xs text-destructive">{entry.error_message}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
