import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  lazy,
  Suspense,
  useRef,
} from "react";
import {
  LayoutDashboard,
  ArrowLeftRight,
  ChartNoAxesCombined,
  Landmark,
  SlidersHorizontal,
  PlugZap,
  ChevronDown,
  ArrowUpRight,
  ArrowDownLeft,
  Plus,
  Search,
  Download,
  Upload,
  RefreshCw,
  ShieldCheck,
  Eye,
  EyeOff,
  X,
  Check,
  ArrowRight,
  Box,
  ChartColumn,
  CalendarDays,
  ExternalLink,
  Info,
  AlertCircle,
  Wallet,
  Menu,
  CheckCheck,
  CreditCard,
  UserRound,
  Settings2,
  LineChart,
} from "lucide-react";
import { Settings } from "./Settings";
import { Payments } from "./Payments";
import { DailyChart } from "./DailyChart";
import { CategorySpend } from "./CategorySpend";
import { defaultPreferences } from "../shared/preferences.js";
import type {
  Preferences,
  PaymentRule,
  WidgetId,
} from "../shared/preferences.js";
import { GlassChrome } from "./Glass";
import { selectAccounts, selectTransactions, accountSummary } from "./finance";
import type { State, Transaction } from "./types";
import { money, localDate, totals, daily } from "./types";
const Landscape = lazy(() => import("./Landscape"));
const pages = [
  { name: "Overview", icon: LayoutDashboard },
  { name: "Activity", icon: ArrowLeftRight },
  { name: "Cash flow", icon: ChartNoAxesCombined },
  { name: "Accounts", icon: Landmark },
  { name: "Payments", icon: CreditCard },
  { name: "Budgets", icon: SlidersHorizontal },
  { name: "Connections", icon: PlugZap },
];
function Glyph() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <path d="M4 10l10 5 6-9 6 9 10-5-4 21-12 7-12-7z" fill="currentColor" />
      <path
        d="M12 22l5 2m11-2l-5 2"
        stroke="#182018"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
const dateLabel = (s: string) =>
  new Date(s + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
const signed = (n: number) => `${n > 0 ? "+" : ""}${money(n)}`;
function download(name: string, content: string) {
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/csv;charset=utf-8;" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const csvCell = (v: string | number) => {
  const s = String(v);
  return (
    '"' +
    (typeof v === "string" && /^[=+@\t\r-]/.test(s) ? "'" + s : s).replaceAll(
      '"',
      '""',
    ) +
    '"'
  );
};
export default function App() {
  const [mode, setMode] = useState<"demo" | "live">(() =>
    localStorage.getItem("fg-mode") === "live" ? "live" : "demo",
  );
  const [state, setState] = useState<State | null>(null),
    [page, setPage] = useState("Overview"),
    [period, setPeriod] = useState("30"),
    [account, setAccount] = useState("all"),
    [bank, setBank] = useState("all");
  const [selected, setSelected] = useState<string | null>(null),
    [search, setSearch] = useState(""),
    [kind, setKind] = useState("all"),
    [dim, setDim] = useState("3D"),
    [category, setCategory] = useState("all");
  const [previewPreferences, setPreviewPreferences] =
    useState<Preferences | null>(null);
  const preferences =
    previewPreferences || state?.preferences || defaultPreferences;
  const colors = preferences.appearance.categoryColors;
  useEffect(() => {
    const a = preferences.appearance;
    const css: Record<string, string> = {
      "--bg": a.background,
      "--surface": a.surface,
      "--panel": a.surface + "dd",
      "--text": a.text,
      "--muted": a.muted,
      "--accent": a.accent,
      "--green": a.income,
      "--red": a.expense,
      "--yellow": a.pending,
      "--border-color": a.border,
      "--line": a.border + "38",
      "--radius": a.radius + "px",
      "--on-accent":
        parseInt(a.accent.slice(1, 3), 16) * 0.2126 +
          parseInt(a.accent.slice(3, 5), 16) * 0.7152 +
          parseInt(a.accent.slice(5, 7), 16) * 0.0722 >
        145
          ? "#172318"
          : "#ffffff",
    };
    for (const [key, value] of Object.entries(css))
      document.documentElement.style.setProperty(key, value);
  }, [preferences.appearance]);

  const [hidden, setHidden] = useState(
      () => sessionStorage.getItem("fg-hidden") === "true",
    ),
    [modal, setModal] = useState<string | null>(null),
    [toast, setToast] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [mobile, setMobile] = useState(false);
  useEffect(() => {
    if (modal !== "settings") setPreviewPreferences(null);
  }, [modal]);
  const [csv, setCsv] = useState(""),
    [preview, setPreview] = useState<{
      count: number;
      duplicates: number;
      rows: Transaction[];
    } | null>(null);
  const [budgetEdits, setBudgetEdits] = useState<Record<string, number>>({}),
    [demoBudgets, setDemoBudgets] = useState<Record<string, number> | null>(
      null,
    ),
    [limit, setLimit] = useState(30);
  const dialog = useRef<HTMLDialogElement>(null),
    returnFocus = useRef<HTMLElement | null>(null);
  const notify = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(""), 6000);
  }, []);
  const activeMode = useRef(mode);
  activeMode.current = mode;
  const load = useCallback(
    async (requestedMode: "demo" | "live" = mode) => {
      try {
        const response = await fetch(`/api/state?mode=${requestedMode}`);
        if (!response.ok) throw new Error("Could not reach your local server.");
        const next = await response.json();
        if (activeMode.current === requestedMode) {
          setState(next);
          setError("");
        }
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [mode],
  );
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 60000);
    return () => clearInterval(timer);
  }, [load]);
  useEffect(() => {
    localStorage.setItem("fg-mode", mode);
    setSelected(null);
    setAccount("all");
    setBank("all");
    setCategory("all");
  }, [mode]);
  useEffect(() => {
    if (modal) {
      returnFocus.current = document.activeElement as HTMLElement;
      dialog.current?.showModal();
    } else {
      dialog.current?.close();
      returnFocus.current?.focus();
    }
  }, [modal]);
  useEffect(() => {
    setLimit(30);
  }, [search, bank, account, period, kind, selected, category]);
  const api = async (path: string, body: unknown = {}) => {
    const r = await fetch("/api/" + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Finance-CSRF": state?.csrf || "",
      },
      body: JSON.stringify(body),
    });
    const result = await r.json();
    if (!r.ok) throw new Error(result.error || "Request failed");
    return result;
  };
  const action = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const end = localDate(),
    start = useMemo(() => {
      const d = new Date();
      if (period === "month") d.setDate(1);
      else d.setDate(d.getDate() - Number(period) + 1);
      return localDate(d);
    }, [period, end]);
  const banks = useMemo(
    () => [...new Set(state?.accounts.map((a) => a.institution) || [])].sort(),
    [state],
  );
  const bankAccounts = useMemo(
    () => selectAccounts(state?.accounts || [], bank),
    [state, bank],
  );
  const scopedAccounts = useMemo(
    () => selectAccounts(bankAccounts, "all", account),
    [bankAccounts, account],
  );
  const balance = useMemo(
    () => accountSummary(scopedAccounts),
    [scopedAccounts],
  );
  const accountRows = useMemo(
    () =>
      selectTransactions(state?.transactions || [], scopedAccounts, start, end),
    [state, scopedAccounts, start, end],
  );
  const rows = useMemo(
    () =>
      accountRows.filter((t) => category === "all" || t.category === category),
    [accountRows, category],
  );
  const categoryNames = useMemo(
    () => [...new Set(accountRows.map((t) => t.category))].sort(),
    [accountRows],
  );
  const chooseCategory = (name: string) => {
    setCategory(name);
    setSelected(null);
    setSearch("");
  };
  const scopeEnabled = !["Connections", "Budgets", "Settings"].includes(page);
  const syncTimes = [
    ...(state?.connections.map((c) => c.lastSync) || []),
    state?.actual?.lastSync,
  ]
    .filter((v): v is string => !!v)
    .map((v) => Date.parse(v))
    .filter(Number.isFinite);
  const lastSync = syncTimes.length
    ? new Date(Math.min(...syncTimes)).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      })
    : null;
  const syncFailed =
    state?.connections.some((c) => c.error) || !!state?.actual?.error;
  const chooseBank = (value: string) => {
    setBank(value);
    setAccount("all");
    setSelected(null);
    setSearch("");
    setCategory("all");
  };
  const exploreAccount = (id: string, institution: string) => {
    setBank(institution);
    setAccount(id);
    go("Activity");
  };
  const sum = useMemo(() => totals(rows), [rows]);
  const days = useMemo(() => daily(rows, start, end), [rows, start, end]);
  const chooseDay = useCallback(
    (date: string) => setSelected((s) => (s === date ? null : date)),
    [],
  );
  const filtered = useMemo(
    () =>
      rows
        .filter(
          (t) =>
            (!selected || t.date === selected) &&
            (kind === "all" ||
              (kind === "pending" ? t.pending : t.type === kind)) &&
            `${t.payee} ${t.category}`
              .toLowerCase()
              .includes(search.toLowerCase()),
        )
        .sort(
          (a, b) =>
            b.date.localeCompare(a.date) || a.payee.localeCompare(b.payee),
        ),
    [rows, selected, kind, search],
  );
  const budgets =
    mode === "demo"
      ? demoBudgets || state?.budgets || {}
      : state?.budgets || {};
  const monthRows =
    state?.transactions.filter(
      (t) =>
        t.date.slice(0, 7) === end.slice(0, 7) &&
        t.date <= end &&
        (state.accounts.find((a) => a.id === t.accountId)?.currency === "USD" ||
          mode === "demo") &&
        !t.pending &&
        ["expense", "refund"].includes(t.type),
    ) || [];
  const monthSpend = (category: string) =>
    monthRows
      .filter((t) => t.category === category)
      .reduce((s, t) => s - t.amount, 0);
  useEffect(() => {
    sessionStorage.setItem("fg-hidden", String(hidden));
  }, [hidden]);
  const fmt = (n: number, compact = false) =>
    hidden ? "••••••" : money(n, compact);
  const go = (name: string) => {
    setPage(name);
    setMobile(false);
    setSelected(null);
    setSearch("");
    setKind("all");
    if (name === "Accounts") setAccount("all");
  };
  const exportCSV = () => {
    download(
      "finance-goblin-transactions.csv",
      [
        "date,payee,amount,account,category,type,status",
        ...filtered.map((t) =>
          [
            t.date,
            t.payee,
            t.amount / 100,
            state?.accounts.find((a) => a.id === t.accountId)?.name || "",
            t.category,
            t.type,
            t.pending ? "pending" : "posted",
          ]
            .map(csvCell)
            .join(","),
        ),
      ].join("\n"),
    );
    notify(`Exported ${filtered.length} transactions.`);
  };
  const sync = () =>
    action(async () => {
      if (mode === "demo") {
        notify(
          "Sample data preview. Switch to My finances to sync connected accounts.",
        );
        return;
      }
      const r = await api("sync");
      await load();
      notify(
        r.errors?.length
          ? r.errors.join(" · ")
          : "Your connected accounts are up to date.",
      );
    });
  const launchLink = async (itemId?: string, receivedRedirectUri?: string) => {
    if (state?.desktop && window.financeDesktop) {
      const result = await api("desktop/bank-link", { itemId });
      window.open(result.url, "_blank", "noopener,noreferrer");
      notify(
        "Bank authorization opened in your browser. Your dashboard will update when it finishes.",
      );
      return;
    }

    let linkToken = receivedRedirectUri
      ? sessionStorage.getItem("fg-link-token")
      : null;
    let update = receivedRedirectUri
      ? sessionStorage.getItem("fg-link-update") === "true"
      : !!itemId;
    if (!linkToken) {
      const r = await api("provider/link", { itemId });
      linkToken = r.linkToken;
      update = r.update;
      sessionStorage.setItem("fg-link-token", linkToken!);
      sessionStorage.setItem("fg-link-update", String(update));
    }
    if (!(window as any).Plaid)
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
        s.onload = () => resolve();
        s.onerror = () =>
          reject(
            new Error(
              "Unable to load Plaid Link. Check your internet connection.",
            ),
          );
        document.head.appendChild(s);
      });
    const handler = (window as any).Plaid.create({
      token: linkToken,
      ...(receivedRedirectUri ? { receivedRedirectUri } : {}),
      onSuccess: (publicToken: string, metadata: any) => {
        void action(async () => {
          if (!update) {
            const r = await api("provider/exchange", {
              publicToken,
              institution: metadata.institution?.name || "Connected bank",
            });
            if (r.warning) notify(r.warning);
          } else await api("sync");
          sessionStorage.removeItem("fg-link-token");
          sessionStorage.removeItem("fg-link-update");
          history.replaceState(null, "", "/");
          setMode("live");
          setModal(null);
          await load("live");
          notify("Bank connected. Your data is ready to explore.");
        });
        handler.destroy();
      },
      onExit: (err: any) => {
        if (err)
          notify(err.display_message || "Bank connection was not completed.");
        handler.destroy();
      },
    });
    handler.open();
  };
  useEffect(
    () =>
      window.financeDesktop?.onAction((action) => {
        if (action === "connections") go("Connections");
        if (action === "settings") setModal("settings");
        if (action === "hide-amounts") setHidden((value) => !value);
        if (action === "bank-linked") {
          setMode("live");
          void load("live");
          notify("Bank connected. Your desktop dashboard is up to date.");
        }
      }),
    [load, notify],
  );
  const callbackHandled = useRef(false);
  useEffect(() => {
    if (
      state &&
      location.pathname === "/oauth/callback" &&
      !callbackHandled.current
    ) {
      callbackHandled.current = true;
      void action(() => launchLink(undefined, location.href));
    }
  }, [state]);
  const renderChart = () => (
    <section className="panel landscape-panel">
      <div className="panel-head">
        <div>
          <h2>Daily cash flow</h2>
        </div>
        <div className="segmented small">
          {["3D", "2D", "Line"].map((d) => (
            <button
              key={d}
              onClick={() => setDim(d)}
              className={dim === d ? "active" : ""}
            >
              {d === "3D" ? (
                <Box size={13} />
              ) : d === "Line" ? (
                <LineChart size={13} />
              ) : (
                <ChartColumn size={13} />
              )}{" "}
              {d}
            </button>
          ))}
        </div>
      </div>
      <div className="chart-summary">
        <strong className={sum.net >= 0 ? "green" : "red"}>
          {fmt(sum.net)}
        </strong>
        <span>
          net cash flow <ArrowUpRight size={14} />
        </span>
        <div className="legend">
          <span>
            <i className="green-dot" />
            Income
          </span>
          <span>
            <i className="red-dot" />
            Expenses
          </span>
          <span>
            <i className="yellow-dot" />
            Pending
          </span>
        </div>
      </div>
      {rows.length ? (
        dim === "3D" ? (
          <Suspense
            fallback={<div className="landscape loading">Loading chart…</div>}
          >
            <Landscape
              days={days}
              onSelect={chooseDay}
              selected={selected}
              hidden={hidden}
              palette={preferences.appearance}
            />
          </Suspense>
        ) : (
          <DailyChart
            days={days}
            onSelect={chooseDay}
            selected={selected}
            hidden={hidden}
            mode={dim === "Line" ? "line" : "bars"}
          />
        )
      ) : (
        <div className="chart-empty">
          <ChartNoAxesCombined size={42} />
          <h3>No activity in this period</h3>
          <p>Choose a different period or connect an account.</p>
          <button className="primary" onClick={() => go("Connections")}>
            Connect your accounts <ArrowRight size={15} />
          </button>
        </div>
      )}
      <div className="chart-axis">
        {days
          .filter((_, i) =>
            Array.from({ length: Math.min(6, days.length) }, (_, tick) =>
              Math.round(
                (tick * (days.length - 1)) /
                  Math.max(1, Math.min(6, days.length) - 1),
              ),
            ).includes(i),
          )
          .map((d) => (
            <span key={d.date}>{dateLabel(d.date)}</span>
          ))}
      </div>
      <div className="chart-footer">
        <span>
          <span className="tiny-orbit">⌘</span>{" "}
          {dim === "3D"
            ? "Drag to orbit · Scroll to zoom · Click a bar to explore"
            : "Select a day to explore its transactions"}
        </span>
        <span>
          USD · {days.length} days · Linear scale
          {days.some((d) => d.expense < 0 || d.income < 0)
            ? " · Credits below zero"
            : ""}
        </span>
      </div>
    </section>
  );
  const renderTransactions = ({ compact = false }: { compact?: boolean }) => (
    <section className="panel transactions-panel">
      <div className="panel-head">
        <div>
          <h2>
            {selected
              ? `Activity on ${dateLabel(selected)}`
              : compact
                ? "Recent activity"
                : "Transactions"}{" "}
            <span className="count">{filtered.length}</span>
          </h2>
        </div>
        {compact ? (
          <button
            className="text-button"
            onClick={() => {
              setPage("Activity");
              setMobile(false);
            }}
          >
            View all <ArrowUpRight size={15} />
          </button>
        ) : (
          <button className="button" onClick={exportCSV}>
            <Download size={14} />
            Export CSV
          </button>
        )}
      </div>
      {!compact && (
        <div className="table-tools">
          <label className="search">
            <Search size={16} />
            <input
              aria-label="Search transactions"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search merchants or categories…"
            />
          </label>
          <select
            aria-label="Transaction type"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="all">All activity</option>
            <option value="income">Income</option>
            <option value="expense">Expenses</option>
            <option value="refund">Refunds</option>
            <option value="transfer">Transfers</option>
            <option value="pending">Pending</option>
          </select>
          {selected && (
            <button className="button" onClick={() => setSelected(null)}>
              <X size={13} />
              Clear day
            </button>
          )}
        </div>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>TRANSACTION</th>
              <th>ACCOUNT</th>
              <th>CATEGORY</th>
              <th>DATE</th>
              <th className="align-right">AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, compact ? 5 : limit).map((t) => (
              <tr key={t.id}>
                <td>
                  <div className="merchant">
                    <span
                      className={`merchant-icon ${t.type === "income" ? "positive" : ""}`}
                    >
                      {t.type === "income" ? (
                        <ArrowDownLeft size={18} />
                      ) : t.type === "transfer" ? (
                        <ArrowLeftRight size={17} />
                      ) : (
                        t.payee.slice(0, 1)
                      )}
                    </span>
                    <div>
                      <strong>{t.payee}</strong>
                      <small>
                        {t.pending ? (
                          <span className="yellow">Pending</span>
                        ) : t.type === "transfer" ? (
                          "Transfer · excluded from totals"
                        ) : t.type === "refund" ? (
                          "Refund · reduces expenses"
                        ) : t.cleared === false ? (
                          "Uncleared in Actual"
                        ) : null}
                      </small>
                    </div>
                  </div>
                </td>
                <td>
                  {state?.accounts.find((a) => a.id === t.accountId)?.name ||
                    "Unknown account"}
                  <small className="transaction-bank">
                    {
                      state?.accounts.find((a) => a.id === t.accountId)
                        ?.institution
                    }
                  </small>
                </td>
                <td>
                  <span className="category-tag">{t.category}</span>
                </td>
                <td>{dateLabel(t.date)}</td>
                <td
                  className={`align-right amount ${t.pending ? "yellow" : t.type === "income" || t.type === "refund" ? "green" : t.type === "transfer" ? "muted" : "amount-expense"}`}
                >
                  {hidden ? "••••••" : signed(t.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && (
          <div className="empty">
            <Search size={24} />
            <h3>No transactions here yet</h3>
            <p>
              {rows.length
                ? "Try another search or clear your filters."
                : "Connect a bank or import your transactions to get started."}
            </p>
          </div>
        )}
      </div>
      {!compact && filtered.length > limit && (
        <button className="load-more" onClick={() => setLimit((l) => l + 50)}>
          Show more transactions <ChevronDown size={14} />
        </button>
      )}
    </section>
  );
  const savePreferences = async (next: Preferences) => {
    const result = await api("preferences", next);
    setState((current) =>
      current ? { ...current, preferences: result.preferences } : current,
    );
  };
  const savePayment = async (rule: PaymentRule) => {
    if (mode !== "live") {
      notify("Switch to your real accounts to save payment dates.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await savePreferences({
        ...preferences,
        payments: [
          ...preferences.payments.filter((p) => p.accountId !== rule.accountId),
          rule,
        ],
      });
      notify("Payment dates saved. Update your calendar reminder if needed.");
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  };
  const metricIds = ["cash", "credit", "income", "expenses", "net", "pending"];
  const metricCount = preferences.widgets.filter((id) =>
    metricIds.includes(id),
  ).length;
  const widgetColumn = (id: WidgetId) =>
    metricIds.includes(id)
      ? `span ${12 / (metricCount <= 4 ? Math.max(1, metricCount) : 3)}`
      : id === "cashFlow"
        ? `span ${preferences.widgets.includes("categories") ? 8 : 12}`
        : id === "categories"
          ? `span ${preferences.widgets.includes("cashFlow") ? 4 : 12}`
          : id === "activity"
            ? `span ${preferences.widgets.includes("accounts") ? 8 : 12}`
            : id === "accounts"
              ? `span ${preferences.widgets.includes("activity") ? 4 : 12}`
              : "span 12";
  const renderPayments = (compact = false) => (
    <Payments
      accounts={scopedAccounts}
      rules={preferences.payments}
      timeZone={preferences.timeZone}
      fmt={fmt}
      onSave={savePayment}
      busy={busy}
      compact={compact}
      onOpen={() => go("Payments")}
    />
  );
  const renderWidget = (id: WidgetId) => {
    switch (id) {
      case "cash":
        return (
          <Metric
            label="Cash available"
            value={
              balance.cashCount && !balance.cashKnownCount
                ? "—"
                : fmt(balance.availableCash)
            }
            note={
              balance.availableReported
                ? "Available to spend"
                : balance.cashCount
                  ? "Current cash balance · available not reported"
                  : "No cash accounts selected"
            }
            icon={<Wallet size={17} />}
            spark={[]}
            color="green"
          />
        );
      case "credit":
        return (
          <Metric
            label="Card balances"
            value={
              balance.creditCount && !balance.creditKnownCount
                ? "—"
                : fmt(balance.creditDebt)
            }
            note={`${balance.creditCount} credit ${balance.creditCount === 1 ? "card" : "cards"} · balance owed`}
            icon={<CreditCard size={17} />}
            spark={[]}
            color="red"
          />
        );
      case "net":
        return (
          <Metric
            label="Net balance"
            value={balance.knownCount ? fmt(balance.net) : "—"}
            note="Cash less debt"
            icon={<Wallet size={17} />}
            spark={[]}
            color="green"
          />
        );
      case "income":
        return (
          <Metric
            label="Income"
            value={fmt(sum.income)}
            note=""
            icon={<ArrowDownLeft size={17} />}
            spark={days.map((d) => d.income)}
            color="green"
          />
        );
      case "expenses":
        return (
          <Metric
            label="Expenses"
            value={fmt(sum.expense)}
            note=""
            icon={<ArrowUpRight size={17} />}
            spark={days.map((d) => d.expense)}
            color="red"
          />
        );
      case "pending":
        return (
          <Metric
            label="Pending"
            value={fmt(sum.pending)}
            note="Excluded from posted totals"
            icon={<span className="pending-icon" />}
            spark={days.map((d) => d.pending)}
            color="yellow"
          />
        );
      case "payments":
        return renderPayments(true);
      case "cashFlow":
        return renderChart();
      case "categories":
        return (
          <CategorySpend
            rows={accountRows}
            selected={category}
            onSelect={chooseCategory}
            hidden={hidden}
            colors={colors}
          />
        );
      case "activity":
        return renderTransactions({ compact: true });
      case "accounts":
        return (
          <section className="panel accounts-preview">
            <div className="panel-head">
              <div>
                <h2>Accounts</h2>
              </div>
              <button
                aria-label="View all accounts"
                className="icon-button"
                onClick={() => go("Accounts")}
              >
                <ArrowUpRight size={18} />
              </button>
            </div>
            {scopedAccounts.slice(0, 4).map((a) => (
              <button
                className="account-mini"
                key={a.id}
                onClick={() => {
                  exploreAccount(a.id, a.institution);
                }}
              >
                <span
                  className={`bank-icon ${a.institution.includes("American") ? "amex" : "boa"}`}
                >
                  {a.institution.includes("American")
                    ? "AMEX"
                    : a.source === "csv"
                      ? "CSV"
                      : a.source === "actual"
                        ? "A"
                        : "BofA"}
                </span>
                <div>
                  <strong>{a.name}</strong>
                  <small>
                    {a.institution} {a.mask && `· ${a.mask}`}
                  </small>
                </div>
                <b>
                  {a.balance === null ? "Unknown" : fmt(a.balance, true)}
                  <small>
                    {["credit", "loan"].includes(a.type) ? "owed" : "balance"}
                  </small>
                </b>
              </button>
            ))}
            {!scopedAccounts.length && (
              <div className="empty">
                <Landmark size={28} />
                <p>No accounts in this selection.</p>
                <button
                  className="text-button"
                  onClick={() => go("Connections")}
                >
                  Connect your first account <ArrowRight size={13} />
                </button>
              </div>
            )}
            <div className="account-note">
              <ShieldCheck size={14} />
              {mode === "demo"
                ? "Illustrative accounts · not connected"
                : "Read-only access. No payments or transfers."}
            </div>
          </section>
        );
    }
  };
  if (!state || state.mode !== mode)
    return (
      <div className="startup">
        <div className="brand-icon">
          <Glyph />
        </div>
        <h2>Finance Goblin</h2>
        <p>{error || "Opening accounts…"}</p>
        {error && <button onClick={() => void load()}>Try again</button>}
      </div>
    );
  return (
    <div
      className={`app ${window.financeDesktop ? "desktop-app" : ""} ${hidden ? "private-mode" : ""}`}
    >
      <aside className={`sidebar ${mobile ? "mobile-open" : ""}`}>
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            go("Overview");
          }}
        >
          <div className="brand-icon">
            <Glyph />
          </div>
          <div>Finance Goblin</div>
        </a>
        <nav>
          {pages.map((p) => (
            <button
              key={p.name}
              className={page === p.name ? "active" : ""}
              onClick={() => go(p.name)}
            >
              <p.icon size={18} />
              {p.name}
              {page === p.name && <GlassChrome radius={12} />}
              {p.name === "Connections" && (
                <span className="nav-number">
                  {state.connections.length +
                    (state.actual?.configured ? 1 : 0)}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className="profile-settings"
            onClick={() => setModal("settings")}
          >
            <span className="profile-avatar">
              <UserRound size={18} />
            </span>
            <strong>{preferences.profileName}</strong>
            <Settings2 size={16} />
          </button>
          <button
            className="sidebar-utility"
            onClick={() => setModal("privacy")}
          >
            <ShieldCheck size={16} />
            Privacy
          </button>
          <button
            className="sidebar-utility"
            onClick={() => setMode(mode === "demo" ? "live" : "demo")}
          >
            <Eye size={16} />
            {mode === "demo" ? "My accounts" : "Sample data"}
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="mobile-toggle icon-button"
            aria-label="Toggle menu"
            onClick={() => setMobile(!mobile)}
          >
            <Menu size={20} />
          </button>
          <div
            className="bank-switcher"
            role="group"
            aria-label="Filter by bank"
          >
            {scopeEnabled ? (
              <>
                <GlassChrome radius={16} />
                {["all", ...banks].map((value) => (
                  <button
                    key={value}
                    aria-pressed={bank === value}
                    onClick={() => chooseBank(value)}
                    className={bank === value ? "active" : ""}
                  >
                    {value === "all" ? "All banks" : value}
                  </button>
                ))}
              </>
            ) : (
              <span className="toolbar-title">
                {page === "Budgets"
                  ? "All banks · Monthly limits"
                  : "Bank connections"}
              </span>
            )}
          </div>
          <div className="topbar-right">
            <button
              className={`sync-control ${syncFailed ? "yellow" : ""}`}
              disabled={busy || state.syncing}
              onClick={sync}
              title={
                syncFailed
                  ? "A connection needs attention. Open Connections for details."
                  : "Check for available bank updates. Banks control when new data is available."
              }
            >
              <RefreshCw
                size={15}
                className={busy || state.syncing ? "spin" : ""}
              />
              <span>
                {busy || state.syncing
                  ? "Syncing…"
                  : syncFailed
                    ? "Sync needs attention"
                    : lastSync && mode === "live"
                      ? `Synced ${lastSync}`
                      : "Sync now"}
              </span>
            </button>
            <button
              className="icon-button"
              aria-label={hidden ? "Show amounts" : "Hide amounts"}
              onClick={() =>
                (() => {
                  sessionStorage.setItem("fg-hidden", String(!hidden));
                  setHidden(!hidden);
                })()
              }
            >
              {hidden ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <h1>{page}</h1>
            </div>
            <div className="heading-actions">
              {page === "Activity" && (
                <button className="button" onClick={() => setModal("import")}>
                  <Upload size={15} />
                  Import CSV
                </button>
              )}
              {["Accounts", "Connections"].includes(page) && (
                <button
                  className="primary"
                  onClick={() =>
                    state.provider.configured
                      ? void action(() => launchLink())
                      : setModal("plaid")
                  }
                >
                  <Plus size={16} />
                  Add bank
                </button>
              )}
              {page === "Overview" && (
                <span className="scope-caption">
                  {scopedAccounts.length}{" "}
                  {scopedAccounts.length === 1 ? "account" : "accounts"}
                  {account !== "all"
                    ? ` · ${scopedAccounts[0]?.name || "Selected account"}`
                    : bank !== "all"
                      ? ` · ${bank}`
                      : " · Combined"}
                </span>
              )}
            </div>
          </div>
          {mode === "demo" && (
            <div className="mode-banner demo">
              <strong>Sample data</strong>
              <button onClick={() => setMode("live")}>
                Back to my accounts <ArrowRight size={14} />
              </button>
            </div>
          )}
          {mode === "live" && state.provider.environment === "sandbox" && (
            <div className="mode-banner demo">
              <strong>Sandbox · Test accounts only</strong>
              <button onClick={() => setModal("plaid")}>
                Connection settings
              </button>
            </div>
          )}
          {error && (
            <div className="error-banner" role="alert">
              <AlertCircle size={16} />
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={15} />
              </button>
            </div>
          )}
          {!["Connections", "Accounts", "Budgets", "Payments"].includes(
            page,
          ) && (
            <div className="filterbar">
              <div className="periods">
                <GlassChrome radius={13} />
                {[
                  ["7", "7 days"],
                  ["30", "30 days"],
                  ["90", "90 days"],
                  ["month", "This month"],
                ].map(([id, label]) => (
                  <button
                    aria-pressed={period === id}
                    className={period === id ? "active" : ""}
                    onClick={() => {
                      setPeriod(id);
                      setSelected(null);
                    }}
                    key={id}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="filter-right">
                <span className="date-range">
                  <CalendarDays size={14} />
                  {dateLabel(start)} – {dateLabel(end)},{" "}
                  {new Date().getFullYear()}
                </span>
                <select
                  aria-label="Filter account"
                  value={account}
                  onChange={(e) => {
                    setAccount(e.target.value);
                    setSelected(null);
                  }}
                >
                  <option value="all">All accounts</option>
                  {bankAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.mask ? ` · ${a.mask}` : ""}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Filter category"
                  value={category}
                  onChange={(e) => chooseCategory(e.target.value)}
                >
                  <option value="all">All categories</option>
                  {categoryNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          {page === "Overview" && preferences.widgets.length === 0 && (
            <div className="panel empty">
              <h2>Your dashboard</h2>
              <button className="primary" onClick={() => setModal("settings")}>
                Choose widgets
              </button>
            </div>
          )}
          {page === "Overview" && (
            <div className="dashboard-grid">
              {preferences.widgets.map((id) => (
                <div
                  key={id}
                  className={`dashboard-widget widget-${id}`}
                  style={{ gridColumn: widgetColumn(id) }}
                >
                  {renderWidget(id)}
                </div>
              ))}
            </div>
          )}
          {page === "Activity" && (
            <>
              <div className="activity-stats">
                <span>
                  <i className="green-dot" />
                  Income <strong>{fmt(sum.income)}</strong>
                </span>
                <span>
                  <i className="red-dot" />
                  Expenses <strong>{fmt(sum.expense)}</strong>
                </span>
                <span>
                  <i className="yellow-dot" />
                  Pending <strong>{fmt(sum.pending)}</strong>
                </span>
                <span>Transfers excluded from cash-flow totals</span>
              </div>
              <div className="activity-charts">
                <CategorySpend
                  rows={accountRows}
                  selected={category}
                  onSelect={chooseCategory}
                  hidden={hidden}
                  colors={colors}
                />
                {renderChart()}
              </div>
              {renderTransactions({})}
            </>
          )}
          {page === "Cash flow" && (
            <>
              {renderChart()}
              <div className="daily-heading">
                <div>
                  <h2>Day by day</h2>
                  <p>
                    Posted income and expenses. Pending activity stays separate.
                  </p>
                </div>
                {selected && (
                  <button className="button" onClick={() => setSelected(null)}>
                    Clear selection <X size={13} />
                  </button>
                )}
              </div>
              <div className="daily-grid">
                {days.map((d) => (
                  <button
                    className={`day-card ${selected === d.date ? "selected" : ""}`}
                    key={d.date}
                    onClick={() => chooseDay(d.date)}
                  >
                    <span>
                      {new Date(d.date + "T12:00:00").toLocaleDateString(
                        "en-US",
                        { weekday: "short" },
                      )}
                      <b>{dateLabel(d.date)}</b>
                    </span>
                    <strong
                      className={
                        d.net > 0 ? "green" : d.net < 0 ? "red" : "muted"
                      }
                    >
                      {fmt(d.net, true)}
                    </strong>
                    <small>
                      <span className="green">↙ {fmt(d.income, true)}</span>
                      <span className="red">↗ {fmt(d.expense, true)}</span>
                    </small>
                    {d.pending > 0 && (
                      <small className="yellow">{fmt(d.pending)} pending</small>
                    )}
                  </button>
                ))}
              </div>
              {selected && renderTransactions({})}
            </>
          )}
          {page === "Payments" && renderPayments()}
          {page === "Accounts" && (
            <>
              <div className="account-summary">
                <div>
                  <span className="summary-label">Cash available</span>
                  <h2>
                    {balance.cashKnownCount ? fmt(balance.availableCash) : "—"}
                  </h2>
                </div>
                <div>
                  <span className="summary-label">Card balances owed</span>
                  <h2>{fmt(balance.creditDebt)}</h2>
                </div>
              </div>
              <div className="account-cards">
                {scopedAccounts.map((a) => (
                  <section className="panel account-card" key={a.id}>
                    <div className="panel-head">
                      <span
                        className={`bank-icon ${a.institution.includes("American") ? "amex" : "boa"}`}
                      >
                        {a.institution.includes("American")
                          ? "AMEX"
                          : a.source === "actual"
                            ? "A"
                            : a.source === "csv"
                              ? "CSV"
                              : "BofA"}
                      </span>
                      <span className="subtle-chip">
                        {a.source === "demo"
                          ? "Sample"
                          : ["credit", "loan"].includes(a.type)
                            ? "Credit"
                            : a.type === "depository"
                              ? "Spendable cash"
                              : "Account"}
                      </span>
                    </div>
                    <p>{a.institution}</p>
                    <h2>{a.name}</h2>
                    <span className="muted">
                      {a.mask ? "•••• " + a.mask : "Account"}
                    </span>
                    <div className="account-balance-kind">
                      {a.type === "credit"
                        ? "Balance owed"
                        : a.type === "depository"
                          ? a.available != null
                            ? "Available to spend"
                            : "Current cash balance"
                          : "Balance"}
                    </div>
                    <strong className="account-balance">
                      {a.balance === null
                        ? "Balance unknown"
                        : a.currency && a.currency !== "USD"
                          ? `${a.currency} ${(a.balance / 100).toFixed(2)}`
                          : fmt(
                              a.type === "depository"
                                ? (a.available ?? a.balance)
                                : a.balance,
                            )}
                    </strong>
                    <p className="small-copy">
                      {a.asOf
                        ? `Retrieved ${new Date(a.asOf).toLocaleString()}`
                        : a.source === "csv"
                          ? "CSV includes activity only. Balance is not inferred."
                          : "Illustrative balance for this preview."}
                    </p>
                    <button
                      className="button"
                      onClick={() => {
                        exploreAccount(a.id, a.institution);
                      }}
                    >
                      Explore activity <ArrowUpRight size={14} />
                    </button>
                  </section>
                ))}
                <button
                  className="add-account"
                  onClick={() => go("Connections")}
                >
                  <Plus size={26} />
                  <h3>Add bank</h3>
                  <p>Connect a bank or link your Actual budget.</p>
                </button>
              </div>
            </>
          )}
          {page === "Budgets" && (
            <>
              <div className="section-toolbar">
                <div>
                  <span className="subtle-chip">
                    {new Date().toLocaleDateString("en-US", {
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                  <p>
                    Monthly limits in USD · posted expenses less refunds · all
                    accounts
                  </p>
                </div>
                <button
                  className="primary"
                  onClick={() => {
                    setBudgetEdits({ ...budgets });
                    setModal("budgets");
                  }}
                >
                  <SlidersHorizontal size={15} />
                  Edit budgets
                </button>
              </div>
              <div className="budget-grid">
                {[
                  ...new Set([
                    ...Object.keys(budgets),
                    ...monthRows.map((t) => t.category),
                  ]),
                ]
                  .filter((c) => c !== "Income" && c !== "Transfer")
                  .map((category, i) => {
                    const spent = monthSpend(category),
                      budget = budgets[category] || 0,
                      ratio = budget ? spent / budget : 0;
                    return (
                      <section className="panel budget-card" key={category}>
                        <div className="panel-head">
                          <span
                            className="category-mark"
                            style={{ color: colors[i % colors.length] }}
                          >
                            {category[0]}
                          </span>
                          <span
                            className={`subtle-chip ${ratio > 1 ? "red" : ratio > 0.8 ? "yellow" : ""}`}
                          >
                            {budget
                              ? ratio > 1
                                ? "Over budget"
                                : ratio > 0.8
                                  ? "Approaching limit"
                                  : "On track"
                              : "No limit set"}
                          </span>
                        </div>
                        <h2>{category}</h2>
                        <div className="budget-amount">
                          <strong>{fmt(spent, true)}</strong>
                          <span>
                            {budget ? `of ${fmt(budget, true)}` : "spent"}
                          </span>
                        </div>
                        <div className="progress">
                          <i
                            style={{
                              width: `${Math.min(100, Math.max(0, ratio * 100))}%`,
                              background:
                                ratio > 1
                                  ? "var(--red)"
                                  : ratio > 0.8
                                    ? "var(--yellow)"
                                    : colors[i % colors.length],
                            }}
                          />
                        </div>
                        {budget > 0 && (
                          <p>{`${fmt(Math.abs(budget - spent), true)} ${spent > budget ? "over your budget" : "left to spend"}`}</p>
                        )}
                      </section>
                    );
                  })}
              </div>
              {!Object.keys(budgets).length && !monthRows.length && (
                <div className="panel empty">
                  <SlidersHorizontal size={32} />
                  <h3>No budgets yet</h3>
                  <p>
                    Create your first budget to start tracking monthly goals.
                  </p>
                </div>
              )}
              {mode === "demo" && (
                <p className="small-copy">
                  Sample budgets can be edited for this preview. Your real
                  budgets are stored separately.
                </p>
              )}
            </>
          )}
          {page === "Connections" && (
            <>
              <div className="panel connection-list">
                <div className="panel-head">
                  <div>
                    <h2>Connected banks</h2>
                  </div>
                  <button
                    className="button"
                    disabled={busy || state.syncing}
                    onClick={sync}
                  >
                    <RefreshCw
                      size={14}
                      className={state.syncing ? "spin" : ""}
                    />
                    Sync now
                  </button>
                </div>
                {state.connections.map((c) => (
                  <div className="connection-row" key={c.id}>
                    <Landmark size={22} />
                    <div>
                      <strong>{c.institution}</strong>
                      <small className={c.error ? "yellow" : ""}>
                        {c.error ||
                          (c.lastSync
                            ? `Last synced ${new Date(c.lastSync).toLocaleString()}`
                            : "Waiting for first sync")}
                      </small>
                    </div>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => void action(() => launchLink(c.id))}
                    >
                      Reconnect
                    </button>
                    <button
                      className="text-button red"
                      onClick={() => setModal("disconnect:" + c.id)}
                    >
                      Disconnect
                    </button>
                  </div>
                ))}
                {state.actual?.configured && (
                  <div className="connection-row">
                    <span className="actual-a">A</span>
                    <div>
                      <strong>Actual Budget</strong>
                      <small className={state.actual.error ? "yellow" : ""}>
                        {state.actual.error ||
                          (state.actual.lastSync
                            ? `Last synced ${new Date(state.actual.lastSync).toLocaleString()}`
                            : "Ready to sync")}
                      </small>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => setModal("actual")}
                    >
                      Settings
                    </button>
                  </div>
                )}
                {!state.connections.length && !state.actual?.configured && (
                  <div className="empty horizontal">
                    <PlugZap size={24} />
                    <div>
                      <strong>No banks connected yet</strong>
                      <p>
                        Your real connections will appear here. Sample accounts
                        are only a preview.
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <details className="connection-options">
                <summary>Settings and imports</summary>
                <div className="connection-grid">
                  <section className="panel provider-card">
                    <div className="provider-logo">
                      plaid<span>↗</span>
                    </div>
                    <span
                      className={`status-label ${state.provider.configured ? "green" : "yellow"}`}
                    >
                      <i />
                      {state.provider.configured
                        ? `${state.provider.environment} configured`
                        : "Setup needed"}
                    </span>
                    <h2>Connect your banks</h2>
                    <p>
                      Link Bank of America, American Express, and other
                      supported institutions using Plaid’s bank authorization
                      flow.
                    </p>
                    <div className="provider-actions">
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() =>
                          state.provider.configured
                            ? void action(() => launchLink())
                            : setModal("plaid")
                        }
                      >
                        {state.provider.configured
                          ? "Connect a bank"
                          : "Set up Plaid"}
                        <ArrowRight size={15} />
                      </button>
                      <button
                        className="text-button"
                        onClick={() => setModal("plaid")}
                      >
                        API settings
                      </button>
                    </div>
                    <small>
                      Transactions sync every 30 minutes while this app runs.
                      Bank data refresh timing varies.
                    </small>
                  </section>
                  <section className="panel provider-card">
                    <div className="provider-logo actual-logo">
                      actual<span>▨</span>
                    </div>
                    <span
                      className={`status-label ${state.actual?.configured ? "green" : "muted"}`}
                    >
                      <i />
                      {state.actual?.configured
                        ? "Budget linked"
                        : "Optional data source"}
                    </span>
                    <h2>Actual Budget</h2>
                    <p>
                      Keep Actual as your ledger. Read account balances,
                      categories, and transactions from your Actual server.
                    </p>
                    <div className="provider-actions">
                      <button
                        className="button"
                        onClick={() => setModal("actual")}
                      >
                        {state.actual?.configured
                          ? "Actual settings"
                          : "Connect Actual"}
                        <ArrowRight size={15} />
                      </button>
                      <a
                        className="text-button"
                        href="https://actualbudget.org/docs/"
                        target="_blank"
                        rel="noreferrer"
                      >
                        About Actual <ExternalLink size={13} />
                      </a>
                    </div>
                    <small>
                      Read-only projection. It does not edit your Actual budget
                      or start bank imports.
                    </small>
                  </section>
                </div>
                <div className="panel csv-card">
                  <div className="csv-icon">
                    <Upload size={23} />
                  </div>
                  <div>
                    <h2>Import transactions</h2>
                    <p>
                      Import transactions from any bank with a CSV. Preview
                      before importing, with duplicate detection.
                    </p>
                  </div>
                  <button className="button" onClick={() => setModal("import")}>
                    Import CSV <ArrowUpRight size={14} />
                  </button>
                </div>
                <p className="source-note">
                  <Info size={14} />
                  Use one source per real account to avoid counting the same
                  activity twice across Plaid, Actual, and CSV. USD totals
                  exclude other currencies.
                </p>
              </details>
            </>
          )}
        </main>
      </div>
      <dialog
        className={modal === "settings" ? "settings-dialog" : ""}
        ref={dialog}
        onCancel={() => setModal(null)}
        onClick={(e) => {
          if (e.target === dialog.current) {
            const r = dialog.current.getBoundingClientRect();
            if (
              e.clientX < r.left ||
              e.clientX > r.right ||
              e.clientY < r.top ||
              e.clientY > r.bottom
            )
              setModal(null);
          }
        }}
      >
        <div className="modal-head">
          <div className="brand-icon">
            <Glyph />
          </div>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={() => setModal(null)}
          >
            <X size={20} />
          </button>
        </div>
        {modal === "settings" && (
          <Settings
            preferences={state.preferences || defaultPreferences}
            onPreview={setPreviewPreferences}
            busy={busy}
            onSave={(next) =>
              action(async () => {
                await savePreferences(next);
                setPreviewPreferences(null);
                setModal(null);
                notify("Settings saved.");
              })
            }
          />
        )}
        {modal === "privacy" && (
          <>
            <h2>Privacy</h2>
            <p>
              The app listens only on this Mac’s loopback interface. Financial
              records and API credentials are encrypted in a local SQLite vault,
              with a separate owner-only key file.
            </p>
            <p>
              Plaid handles bank authorization and retrieves bank data with your
              consent. Actual connections retrieve a read-only projection from
              your chosen Actual server. No payment, trading, or transfer
              actions are implemented.
            </p>
            <p>
              This is a single-user workspace for a trusted macOS login. It does
              not provide the native Surf app’s biometric lock. Other processes
              running as your macOS user can access local data; enable FileVault
              and lock your Mac when away.
            </p>
            <button className="primary full" onClick={() => setModal(null)}>
              Got it <Check size={16} />
            </button>
          </>
        )}
        {modal === "plaid" && (
          <>
            <h2>Plaid settings</h2>
            <p>
              Keys stay encrypted on this Mac. Choose Production for real bank
              accounts; Sandbox uses simulated data.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void action(async () => {
                  await api("provider/config", Object.fromEntries(f));
                  await load();
                  setModal(null);
                  notify("Plaid configured. You can now connect a bank.");
                });
              }}
            >
              <label>
                Environment
                <select
                  name="environment"
                  defaultValue={state.provider.environment || "sandbox"}
                >
                  <option value="sandbox">Sandbox · test accounts</option>
                  <option value="production">Production · real banks</option>
                </select>
              </label>
              <label>
                Client ID
                <input
                  required
                  name="clientId"
                  autoComplete="off"
                  placeholder="Your Plaid client ID"
                />
              </label>
              <label>
                Secret
                <input
                  required
                  type="password"
                  name="secret"
                  autoComplete="new-password"
                  placeholder="Environment-specific secret"
                />
              </label>
              {state.desktop ? (
                <>
                  <input
                    type="hidden"
                    name="redirectUri"
                    value={`${state.origin}/oauth/callback`}
                  />
                  <div className="form-note">
                    <Info size={16} />
                    <span>
                      Bank sign-in opens securely in your browser. No custom
                      redirect URL is needed for this desktop flow. Real
                      accounts require Production access enabled by Plaid.
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <label>
                    OAuth redirect URL
                    <input
                      required
                      type="url"
                      name="redirectUri"
                      defaultValue={
                        state.provider.redirectUri ||
                        `${state.origin}/oauth/callback`
                      }
                    />
                  </label>
                  <div className="form-note">
                    <Info size={16} />
                    <span>
                      Allowlist this exact URL in Plaid. Production redirects
                      require HTTPS.
                    </span>
                  </div>
                </>
              )}
              <a
                href="https://dashboard.plaid.com/signup"
                target="_blank"
                rel="noreferrer"
                className="text-button"
              >
                Open Plaid dashboard <ExternalLink size={13} />
              </a>
              <button disabled={busy} className="primary full" type="submit">
                {busy ? "Checking credentials…" : "Verify and save locally"}
                <ShieldCheck size={15} />
              </button>
            </form>
          </>
        )}
        {modal === "actual" && (
          <>
            <h2>Actual Budget settings</h2>
            <p>
              Use your running Actual server and the Sync ID from Settings →
              Advanced. Credentials are encrypted on this Mac. The connector
              reads a temporary local copy and removes it after syncing.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void action(async () => {
                  await api("actual/config", Object.fromEntries(f));
                  setMode("live");
                  await load("live");
                  setModal(null);
                  notify("Actual connected. Your budget data is ready.");
                });
              }}
            >
              <label>
                Actual server URL
                <input
                  required
                  type="url"
                  name="serverURL"
                  placeholder="http://localhost:5006"
                  defaultValue={
                    state.actual?.serverURL || "http://localhost:5006"
                  }
                />
              </label>
              <label>
                Server password
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                />
              </label>
              <label>
                Budget Sync ID
                <input
                  name="budgetId"
                  required
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  defaultValue={state.actual?.budgetId || ""}
                />
              </label>
              <label>
                Budget encryption password{" "}
                <span className="muted">(if enabled)</span>
                <input
                  name="encryptionPassword"
                  type="password"
                  autoComplete="new-password"
                />
              </label>
              <div className="form-note">
                <Info size={16} />
                <span>
                  Actual remains your source of truth. Bank imports are managed
                  inside Actual. Do not connect the same account via Plaid too.
                </span>
              </div>
              <button disabled={busy} className="primary full" type="submit">
                {busy
                  ? "Reading your Actual budget…"
                  : "Connect and read budget"}
                <ArrowRight size={15} />
              </button>
            </form>
            {state.actual?.configured && (
              <button
                disabled={busy}
                className="text-button red full"
                onClick={() =>
                  void action(async () => {
                    await api("actual/disconnect");
                    await load();
                    setModal(null);
                    notify(
                      "Actual disconnected. Its projection has been removed.",
                    );
                  })
                }
              >
                Disconnect Actual from this dashboard
              </button>
            )}
          </>
        )}
        {modal === "import" && (
          <>
            <h2>Import CSV</h2>
            <p>
              Use columns <code>date, payee, amount, account</code>. Amounts are
              signed USD values: income is positive, spending is negative.
              Optional: category, type, status, reference.
            </p>
            <button
              className="text-button"
              onClick={() =>
                download(
                  "finance-goblin-template.csv",
                  "date,payee,amount,account,category,type,status,reference\n2026-11-01,Example Payroll,2500.00,Checking,Income,income,posted,pay-1\n2026-11-02,Example Coffee,-6.50,Checking,Food & drink,expense,posted,coffee-1\n",
                )
              }
            >
              Download CSV template <Download size={14} />
            </button>
            <label className="dropzone">
              <Upload size={28} />
              <strong>
                {csv ? "File loaded. Ready to preview." : "Choose a CSV file"}
              </strong>
              <span>Up to 4 MB · 10,000 transactions</span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  setPreview(null);
                  if (f) {
                    if (f.size > 4000000) {
                      notify("Choose a CSV under 4 MB.");
                      return;
                    }
                    void f.text().then(setCsv);
                  }
                }}
              />
            </label>
            {preview && (
              <div className="import-preview">
                <strong>
                  {preview.count} rows found · {preview.duplicates} already
                  imported
                </strong>
                <p>
                  {preview.count - preview.duplicates} new transactions will be
                  added to your real finances.
                </p>
                {preview.rows.slice(0, 3).map((r, i) => (
                  <div key={i}>
                    <span>
                      {dateLabel(r.date)} · {r.payee}
                    </span>
                    <b>{money(r.amount)}</b>
                  </div>
                ))}
              </div>
            )}
            <div className="form-note">
              <Info size={16} />
              <span>
                Imports always go to your real data. Duplicate matching uses
                date, payee, amount, account and optional reference. Give
                identical transactions distinct references.
              </span>
            </div>
            <button
              className="primary full"
              disabled={!csv || busy}
              onClick={() =>
                void action(async () => {
                  if (!preview) {
                    setPreview(await api("import/preview", { csv }));
                    return;
                  }
                  const r = await api("import", { csv });
                  setMode("live");
                  await load("live");
                  setModal(null);
                  setCsv("");
                  setPreview(null);
                  notify(`Imported ${r.count} new transactions.`);
                })
              }
            >
              {busy
                ? "Reading file…"
                : preview
                  ? "Import into my finances"
                  : "Preview import"}
              <ArrowRight size={15} />
            </button>
          </>
        )}
        {modal === "budgets" && (
          <>
            <h2>Set your monthly budgets.</h2>
            <p>
              Enter monthly USD limits. A zero leaves a category without a
              limit.
              {mode === "demo"
                ? " These changes apply to sample budgets only."
                : ""}
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void action(async () => {
                  if (mode === "demo") setDemoBudgets(budgetEdits);
                  else {
                    await api("budgets", { budgets: budgetEdits });
                    await load();
                  }
                  setModal(null);
                  notify("Monthly budgets updated.");
                });
              }}
            >
              <div className="budget-inputs">
                {[
                  ...new Set([
                    "Housing",
                    "Food & drink",
                    "Shopping",
                    "Transport",
                    "Subscriptions",
                    "Health",
                    "Travel",
                    "Other",
                    ...Object.keys(budgetEdits),
                    ...monthRows.map((t) => t.category),
                  ]),
                ].map((c) => (
                  <label key={c}>
                    {c}
                    <span>
                      $
                      <input
                        type="number"
                        aria-label={`${c} monthly budget`}
                        min="0"
                        max="1000000"
                        step="0.01"
                        value={(budgetEdits[c] || 0) / 100}
                        onChange={(e) =>
                          setBudgetEdits((b) => ({
                            ...b,
                            [c]: Math.round(Number(e.target.value) * 100),
                          }))
                        }
                      />
                    </span>
                  </label>
                ))}
              </div>
              <button className="primary full" disabled={busy} type="submit">
                Save budgets <Check size={16} />
              </button>
            </form>
          </>
        )}
        {modal?.startsWith("disconnect:") && (
          <>
            <h2>Disconnect this bank?</h2>
            <p>
              This revokes the Plaid connection and removes its accounts and
              transaction history from this dashboard. It does not change your
              bank accounts.
            </p>
            <div className="modal-actions">
              <button className="button" onClick={() => setModal(null)}>
                Keep connection
              </button>
              <button
                className="button danger"
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    await api(`connections/${modal.split(":")[1]}/disconnect`);
                    await load();
                    setModal(null);
                    notify("Bank disconnected and its local data removed.");
                  })
                }
              >
                Disconnect bank
              </button>
            </div>
          </>
        )}
        {error && modal && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </dialog>
      {toast && (
        <div className="toast" role="status">
          <CheckCheck size={17} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
function Metric({
  label,
  value,
  note,
  icon,
  spark,
  color,
  demo = false,
}: {
  label: string;
  value: string;
  note: string;
  icon: React.ReactNode;
  spark: number[];
  color: string;
  demo?: boolean;
}) {
  const max = Math.max(...spark, 1),
    min = Math.min(...spark, 0);
  const points = spark
    .map(
      (v, i) =>
        `${(i / (spark.length - 1 || 1)) * 100},${30 - ((v - min) / (max - min || 1)) * 25}`,
    )
    .join(" ");
  return (
    <section className={`metric ${label === "Net balance" ? "featured" : ""}`}>
      <div className="metric-label">
        {label}
        <span className={color}>{icon}</span>
      </div>
      <strong>{value}</strong>
      <div className="metric-bottom">
        <span>{note}</span>
        {spark.length > 1 && (label !== "Net balance" || demo) ? (
          <svg
            className={`sparkline ${color}`}
            viewBox="0 0 100 34"
            aria-hidden="true"
          >
            <polyline
              points={points}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            />
          </svg>
        ) : null}
      </div>
    </section>
  );
}
