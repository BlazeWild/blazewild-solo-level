import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { DateTime } from "luxon";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import {
  ArrowUpRight,
  Plus,
  Check,
  Clock,
  Flame,
  Heart,
  ChevronRight,
  Pause,
  Play,
  Shield,
  Download,
  Settings2,
  Activity,
  CalendarDays,
  ChartNoAxesCombined,
  BookOpen,
  User,
  RotateCcw,
  CheckCheck,
} from "lucide-react";
import {
  categories,
  reward,
  type State,
  type Instance,
  type Template,
  type DailyLog,
  type Settings,
  localDate,
  totals,
} from "../domain/model";
import "./style.css";
const Chart = React.lazy(() =>
  import("./charts").then((m) => ({ default: m.Chart })),
);
const HabitRadar = React.lazy(() =>
  import("./charts").then((m) => ({ default: m.HabitRadar })),
);
type AppState = State & {
  totals: ReturnType<typeof totals>;
  integrations: Record<string, boolean>;
};
async function api(path: string, method = "GET", body?: unknown) {
  const r = await fetch("/api" + path, {
    method,
    headers: { "Content-Type": "application/json", "X-Level-Up": "local" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error || "Request failed");
  return data;
}
const tabs = [
  ["Today", Activity],
  ["Quests", BookOpen],
  ["Timeline", CalendarDays],
  ["Character", User],
  ["Progress", ChartNoAxesCombined],
  ["Nutrition", Heart],
  ["Weekly review", CheckCheck],
  ["Settings", Settings2],
] as const;
const cycles = ["Push", "Pull", "Legs", "Arms", "Basketball"];
const evening = [
  "Easy walking & shoulder mobility",
  "Hips, ankles & a little walking",
  "Gentle handstand technique, if recovered",
  "An easy walk. Let your elbows recover.",
  "Recovery, mobility or meditation",
];
const blankLog = (date: string): DailyLog => ({
  date,
  weight: null,
  waist: null,
  steps: null,
  sleep: null,
  sleptAt: null,
  wokeAt: null,
  desk: null,
  pullups: null,
  handstand: null,
  fatigue: "normal",
  food: "",
  provenance: "Manual self-report",
});
function Login({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState(""), [password, setPassword] = useState(""), [error, setError] = useState("");
  return <main className="login-page"><section className="card feature login-hero"><span className="tag">PRIVATE · SINGLE PLAYER</span><h1>Turn your routine into a comeback arc.</h1><p>Track quests, recovery, training rotations, photo adventures, and steady progress. Personal details remain hidden until the owner signs in.</p></section><form className="card login-card" onSubmit={async (e) => { e.preventDefault(); setError(""); const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json", "X-Level-Up": "local" }, body: JSON.stringify({ username, password }) }); const data = await r.json(); if (!r.ok) return setError(data.error); onSuccess(); }}><h2>Owner login</h2><label>Email or username<input autoComplete="username" required value={username} onChange={e => setUsername(e.target.value)} /></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>{error && <p className="banner error">{error}</p>}<button className="primary">Sign in</button><small className="muted">No sign-up is available. A secure cookie keeps you signed in for 30 days.</small></form></main>;
}
function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null),
    [s, setS] = useState<AppState | null>(null),
    [tab, setTab] = useState("Today"),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [now, setNow] = useState(Date.now()),
    [editor, setEditor] = useState<Partial<Template> | null>(null),
    [modal, setModal] = useState<{ q: Instance; action: "complete" | "correct" | "reschedule"; value?: number } | null>(null),
    [stats, setStats] = useState<any[]>([]),
    [days, setDays] = useState(30),
    [log, setLog] = useState<DailyLog | null>(null),
    [settings, setSettings] = useState<Settings | null>(null),
    [agenda, setAgenda] = useState(""),
    [week, setWeek] = useState(true),
    [preview, setPreview] = useState<any>(null),
    [proposals, setProposals] = useState<any[]>([]),
    [busy, setBusy] = useState(false),
    [chat, setChat] = useState<{ role: string; text: string }[]>([]),
    [chatInput, setChatInput] = useState(""),
    [agentOpen, setAgentOpen] = useState(false),
    [questValues, setQuestValues] = useState<Record<string, string>>({}),
    [selectedQuest, setSelectedQuest] = useState<Instance | null>(null);
  const refresh = async () => {
    try {
      const value = await api("/state");
      setS(value);
      setError("");
    } catch (e) {
      setError(
        (e as Error).message ||
          "Server unavailable. Changes are not queued offline.",
      );
    }
  };
  useEffect(() => {
    fetch("/api/auth/session").then(r => r.json()).then(v => { setAuthenticated(v.authenticated); if (v.authenticated) void refresh(); }).catch(() => setAuthenticated(false));
    const t = setInterval(() => {
        setNow(Date.now());
      }, 1000),
      r = setInterval(() => void refresh(), 15000);
    return () => {
      clearInterval(t);
      clearInterval(r);
    };
  }, []);
  useEffect(() => {
    if (s && tab === "Progress")
      api("/stats?days=" + days)
        .then(setStats)
        .catch((e) => setError(e.message));
  }, [days, tab, s?.logs, s?.ledger.length]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!s || s.settings.notifications !== "browser") return;
    let active = true;
    const claim = async () => {
      try {
        const jobs = await api("/notifications/claim", "POST", {});
        for (const j of jobs) {
          if (!active) break;
          let success = false,
            err = "";
          try {
            if (
              !("Notification" in window) ||
              Notification.permission !== "granted"
            )
              throw Error("Browser notification permission is not granted");
            new Notification(j.title, {
              body: "Open Level Up to view your quest.",
              tag: j.id,
            });
            success = true;
          } catch (e) {
            err = (e as Error).message;
          }
          await api(
            "/notifications/" + encodeURIComponent(j.id) + "/ack",
            "POST",
            { success, error: err },
          );
        }
      } catch {}
    };
    void claim();
    const t = setInterval(() => void claim(), 10000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [s?.settings.notifications]);
  async function run(
    path: string,
    method = "POST",
    body: unknown = {},
    message = "Saved",
  ) {
    setBusy(true);
    try {
      const result = await api(path, method, body);
      await refresh();
      setToast(message);
      return result;
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  }
  const safe = (fn: () => Promise<unknown>) => {
    void fn().catch((e) => setError(e.message || "Request failed"));
  };
  if (authenticated === false) return <Login onSuccess={() => { setAuthenticated(true); void refresh(); }} />;
  if (!s)
    return (
      <main>
        <div className="card">
          <h1>Level Up</h1>
          <p role="status">{error || "Loading your quest log…"}</p>
          <button onClick={() => void refresh()}>Retry connection</button>
        </div>
      </main>
    );
  const today = localDate(new Date(now).toISOString(), s.settings.timezone),
    current = s.instances.filter(
      (q) => localDate(q.opensAt, s.settings.timezone) === today,
    ),
    done = current.filter((q) => q.status === "completed").length,
    eligible = current.filter(
      (q) => !["excused", "cancelled"].includes(q.status),
    ), surprise = current.find(q => q.proofRequired);
  const activeQuest = s.instances.filter((q) => q.status === "available").sort((a, b) => Date.parse(b.opensAt) - Date.parse(a.opensAt))[0],
    next = s.instances
    .filter((q) => q.status === "scheduled" && Date.parse(q.opensAt) > now)
    .sort((a, b) => Date.parse(a.opensAt) - Date.parse(b.opensAt))[0];
  const featured = activeQuest ?? next;
  const cycle =
    (((Math.floor(
      DateTime.fromISO(today).diff(
        DateTime.fromISO(s.settings.rotationAnchor),
        "days",
      ).days,
    ) +
      s.settings.rotationOffset) %
      5) +
      5) %
    5;
  const total = s.totals,
    rankIndex =
      total.level >= 50
        ? 5
        : total.level >= 35
          ? 4
          : total.level >= 20
            ? 3
            : total.level >= 10
              ? 2
              : total.level >= 5
                ? 1
                : 0;
  const duration = (ms: number) => {
    const sec = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m ${sec % 60}s`;
  };
  const dateTime = (v: string) =>
    DateTime.fromISO(v).setZone(s.settings.timezone).toFormat("h:mm a");
  const questPhase = (q: Instance) => { const minutes = DateTime.fromISO(q.opensAt).setZone(s.settings.timezone).hour * 60 + DateTime.fromISO(q.opensAt).setZone(s.settings.timezone).minute; if (minutes < 600) return ["morning", "Morning"] as const; if (minutes < 900) return ["work", "Workday"] as const; if (minutes < 960) return ["break", "Lunch & walk"] as const; if (minutes < 1110) return ["afternoon", "Afternoon work"] as const; if (minutes < 1320) return ["evening", "Evening"] as const; return ["night", "Night"] as const; };
  const activeLog =
    log ?? s.logs.find((l) => l.date === today) ?? blankLog(today);
  const editLog = (key: string, value: any) =>
    setLog({ ...activeLog, [key]: value });
  const questAction = (q: Instance, action: string) =>
    safe(() => run(`/quests/${encodeURIComponent(q.id)}/${action}`, "POST", {}));
  const requestCompletion = (q: Instance) => {
    const value = Number(questValues[q.id] ?? "");
    if (q.habit === "walking" && q.target > 1 && (!Number.isInteger(value) || value < q.target)) {
      setError(`Enter at least ${q.target.toLocaleString()} steps before completing this walk.`);
      return;
    }
    setModal({ q, action: "complete", value });
  };
  const sendAgent = async () => {
    const message = chatInput.trim(); if (!message || busy) return;
    setChatInput(""); setChat(v => [...v, { role: "user", text: message }]); setBusy(true);
    try { const data = await api("/ai/chat", "POST", { message }); setChat(v => [...v, { role: "agent", text: data.reply }]); }
    catch (e) { setChat(v => [...v, { role: "agent", text: `I couldn't answer: ${(e as Error).message}` }]); }
    finally { setBusy(false); }
  };
  const newTemplate = (): Partial<Template> => ({
    title: "",
    description: "",
    category: "Focus",
    habit: "general",
    difficulty: "normal",
    recurrence: "daily",
    timezone: s.settings.timezone,
    start: "10:00",
    end: "10:30",
    startDate: today,
    grace: s.settings.grace,
    target: 1,
    reminderLead: 5,
    required: true,
    penalty: 5,
    archived: false,
    proofRequired: false,
  });
  const questRow = (q: Instance) => (
    <div
      className={`quest ${q.status}`}
      key={q.id}
      draggable={["scheduled", "available"].includes(q.status)}
      onDragStart={(e) => e.dataTransfer.setData("text/plain", q.id)}
    >
      <button
        className="quest-check"
        aria-label={q.status === "completed" ? "Completed " + q.title : "Complete " + q.title}
        disabled={busy || q.status !== "available" || now > Date.parse(q.dueAt) + q.grace * 60000 || (q.proofRequired && !q.proofUrl) || (q.habit === "walking" && q.target > 1 && (!Number.isInteger(Number(questValues[q.id])) || Number(questValues[q.id]) < q.target))}
        onClick={() => requestCompletion(q)}
      >
        {q.status === "completed" ? <Check size={18} /> : <span />}
      </button>
      <div className="quest-copy">
        <b>{q.title}</b>
        <button className="text-button" onClick={() => setSelectedQuest(q)}>View details</button>
        <small>
          {dateTime(q.opensAt)}–{dateTime(q.dueAt)} · {q.category} · target{" "}
          {q.target} · {q.status} {q.grace > 0 && `· ${q.grace}m grace`}
        </small>
        <small>{q.description}</small>
        {q.habit === "walking" && q.target > 1 && (
          <label className="quest-value">
            Steps during this walk
            <input
              type="number"
              min={q.target}
              max="100000"
              step="1"
              disabled={q.status === "completed"}
              value={q.status === "completed" ? q.completedValue ?? "" : questValues[q.id] ?? ""}
              placeholder={`Minimum ${q.target.toLocaleString()}`}
              onChange={(e) => setQuestValues(v => ({ ...v, [q.id]: e.target.value }))}
            />
            <small>{q.status === "completed" ? `${q.completedValue?.toLocaleString()} steps recorded` : `Required: ${q.target.toLocaleString()}+ steps. Below this is a failed quest.`}</small>
          </label>
        )}
        {q.proofRequired && <label className="button">{q.proofUrl ? "Replace photo proof" : "Upload photo proof"}<input hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => { const file = e.target.files?.[0]; if (file) safe(async () => { const form = new FormData(); form.append("photo", file); const r = await fetch(`/api/quests/${encodeURIComponent(q.id)}/proof`, { method: "POST", headers: { "X-Level-Up": "local" }, body: form }); const data = await r.json(); if (!r.ok) throw Error(data.error); await refresh(); }); }} /></label>}
        <div className="quest-actions">
          {["scheduled", "available"].includes(q.status) && (
            <>
              <button onClick={() => questAction(q, "snooze")}>
                Snooze 10m
              </button>
              <button onClick={() => setModal({ q, action: "reschedule" })}>
                Reschedule
              </button>
              <button onClick={() => questAction(q, "excuse")}>
                Excuse / rest
              </button>
            </>
          )}
          {q.status === "missed" && (
            <>
              <button onClick={() => setModal({ q, action: "correct" })}>
                I did this on time
              </button>
              <button onClick={() => questAction(q, "excuse")}>
                Excuse / illness
              </button>
            </>
          )}
        </div>
      </div>
      <span className="xp">
        +{q.rewardXp ?? reward[q.difficulty]} XP
        <small>
          {q.required ? `up to −${q.penalty} XP/HP` : "optional · no penalty"}
        </small>
      </span>
    </div>
  );
  const questList = (quests: Instance[]) => {
    let previous = "";
    return quests.slice().sort((a, b) => Date.parse(a.opensAt) - Date.parse(b.opensAt)).flatMap(q => {
      const [key, label] = questPhase(q), blocks: React.ReactNode[] = [];
      if (key !== previous) { blocks.push(<div className="phase-divider" key={`phase-${key}`}><span>{label}</span></div>); previous = key; }
      blocks.push(questRow(q)); return blocks;
    });
  };
  const logForm = (
    <>
      <div className="row">
        <label>
          Log date
          <input
            type="date"
            value={activeLog.date}
            max={today}
            onChange={(e) =>
              setLog(
                s.logs.find((l) => l.date === e.target.value) ??
                  blankLog(e.target.value),
              )
            }
          />
        </label>
        <label>
          Recovery today
          <select
            value={activeLog.fatigue}
            onChange={(e) => editLog("fatigue", e.target.value)}
          >
            <option>fresh</option>
            <option>normal</option>
            <option>tired</option>
          </select>
        </label>
      </div>
      <div className="form-grid">
        {[
          ["steps", "Steps (manual)", 1, 100000],
          ["desk", "Desk minutes", 1, 1440],
          ["weight", "Weight (kg)", 0.1, 300],
          ["sleep", "Sleep (hours)", 0.25, 24],
          ["waist", "Waist (inches)", 0.1, 100],
          ["pullups", "Clean pull-ups", 1, 200],
          ["handstand", "Handstand (seconds)", 1, 3600],
        ].map(([key, label, step, max]) => (
          <label key={key}>
            {label}
            <input
              type="number"
              min="0"
              max={max}
              step={step}
              value={(activeLog as any)[key] ?? ""}
              onChange={(e) =>
                editLog(
                  String(key),
                  e.target.value === "" ? null : Number(e.target.value),
                )
              }
            />
          </label>
        ))}
      </div>
      <div className="row"><label>Sleep time<input type="time" value={activeLog.sleptAt ?? ""} onChange={(e) => editLog("sleptAt", e.target.value || null)} /></label><label>Wake time<input type="time" value={activeLog.wokeAt ?? ""} onChange={(e) => editLog("wokeAt", e.target.value || null)} /></label></div>
      <button
        className="primary"
        disabled={busy}
        onClick={() =>
          safe(async () => {
            await run("/logs", "PUT", activeLog, "Manual log saved");
            setLog(null);
          })
        }
      >
        Save log
      </button>
      <p className="muted small">
        No automatic step measurement. Blank values remain missing, never zero.
      </p>
    </>
  );
  return (
    <>
      <header>
        <a className="brand" href="#" onClick={() => setTab("Today")}>
          <img src="/icon.svg" alt="" /> LEVEL UP
          <span className="version">PERSONAL QUEST LOG</span>
        </a>
        <div className="header-right">
          <span className="local-dot" />
          Local mode <span className="muted">· {s.settings.timezone}</span>
          <button
            className="icon-button"
            aria-label="Open settings"
            onClick={() => setTab("Settings")}
          >
            <Settings2 size={18} />
          </button>
          <button onClick={() => safe(async () => { await api("/auth/logout", "POST", {}); setS(null); setAuthenticated(false); })}>Sign out</button>
          <span className="avatar">{s.settings.name.slice(0, 1)}</span>
        </div>
      </header>
      <main>
        {error && (
          <div className="banner error" role="alert">
            {error}
            <button onClick={() => setError("")}>Dismiss</button>
          </div>
        )}
        {s.gapPending && (
          <div className="banner">
            <div>
              <b>Welcome back. Review your absence.</b>
              <p>
                {
                  s.instances.filter(
                    (q) =>
                      ["scheduled", "available"].includes(q.status) &&
                      Date.parse(q.dueAt) + q.grace * 60000 < now,
                  ).length
                }{" "}
                overdue quests. No new penalties have been applied. Excuse the
                gap, or apply daily caps to only the last three days; older
                dates are excused.
              </p>
            </div>
            <button
              onClick={() =>
                safe(() => run("/reconcile", "POST", { decision: "excuse" }))
              }
            >
              Excuse absence
            </button>
            <button
              onClick={() =>
                safe(() => run("/reconcile", "POST", { decision: "apply" }))
              }
            >
              Apply bounded penalties
            </button>
          </div>
        )}
        {total.hp === 0 && (
          <div className="banner">
            Reset day. All features remain available. Choose rest, pause virtual
            penalties, and restart gently.
          </div>
        )}
        <div className="page-intro">
          <div>
            <span className="tag">YOUR COMEBACK ARC · STEADY PROGRESS</span>
            <h1>
              {tab === "Today" ? `Make today count, ${s.settings.name}.` : tab}
            </h1>
            <p className="muted">
              {tab === "Today"
                ? "Small quests. Real progress. Build a day that works for you."
                : "Your pace. Your progress. Rest is part of the plan."}
            </p>
          </div>
          <span className="date-label">
            {DateTime.fromISO(today).toFormat("cccc, dd LLL yyyy")}
            <small>{DateTime.fromMillis(now).setZone("Asia/Kathmandu").toFormat("h:mm:ss a")} · NEPAL TIME</small>
          </span>
        </div>
        <nav aria-label="Main navigation">
          {tabs.map(([name, Icon]) => (
            <button
              key={name}
              className={tab === name ? "active" : ""}
              onClick={() => {
                setTab(name);
                setSettings(null);
              }}
            >
              <Icon size={16} />
              {name}
            </button>
          ))}
        </nav>
        {tab === "Today" && (
          <>
            <div className="hero">
              <div className="card feature">
                <div className="row spread">
                  <span className="tag">
                    <span className="pulse" />{" "}
                    {activeQuest
                      ? "QUEST AVAILABLE"
                      : "NEXT SCHEDULED QUEST"}
                  </span>
                  <span className="pill">{featured?.category ?? "Recovery"}</span>
                </div>
                <h2 className="clickable" onClick={() => featured && setSelectedQuest(featured)}>{featured?.title ?? "Rest. Tomorrow is another day."}</h2>
                <p className="muted">
                  {featured?.description ??
                    "Your progress is saved. Take a breath."}
                </p>
                <div className="countdown">
                  {featured
                    ? duration(
                        Date.parse(
                          activeQuest ? featured.dueAt : featured.opensAt,
                        ) - now,
                      )
                    : "All clear"}
                  <small>
                    {activeQuest
                      ? "remaining for current quest"
                      : `next quest available at ${featured ? dateTime(featured.opensAt) : "—"}`}
                  </small>
                </div>
                {activeQuest && next && <p className="next-line">Next: <b>{next.title}</b> in {duration(Date.parse(next.opensAt) - now)} · available at {dateTime(next.opensAt)}</p>}
                <div className="row">
                  <button
                    className="primary"
                    onClick={() =>
                      safe(() =>
                        run(
                          "/timer",
                          "PUT",
                          { action: "start", minutes: 5 },
                          "Timer started",
                        ),
                      )
                    }
                  >
                    <Play size={16} />
                    Start 5-minute break
                  </button>
                  <button
                    onClick={() =>
                      safe(() =>
                        run(
                          "/settings",
                          "PUT",
                          {
                            ...s.settings,
                            focusUntil: new Date(now + 3600000).toISOString(),
                          },
                          "Reminders paused for one hour",
                        ),
                      )
                    }
                  >
                    <Pause size={16} />
                    Focus for 1h
                  </button>
                </div>
                <div className="timer">
                  <Clock size={14} />
                  {s.timer.end
                    ? `Timer: ${duration(s.timer.end - now)}`
                    : s.timer.remaining
                      ? `Paused: ${duration(s.timer.remaining)}`
                      : "A little movement. A clearer mind."}
                  {(s.timer.end > 0 || s.timer.remaining > 0) && (
                    <button
                      onClick={() =>
                        safe(() =>
                          run("/timer", "PUT", {
                            action: s.timer.end ? "pause" : "resume",
                          }),
                        )
                      }
                    >
                      {s.timer.end ? "Pause timer" : "Resume timer"}
                    </button>
                  )}
                </div>
              </div>
              <div className="card character-mini">
                <div className="row spread">
                  <span className="tag">PLAYER STATUS</span>
                  <span className="pill">
                    {["E", "D", "C", "B", "A", "S"][rankIndex]} RANK
                  </span>
                </div>
                <div className="player">
                  <div className="rank-emblem">
                    <Shield size={42} />
                  </div>
                  <div>
                    <h2>{s.settings.name}</h2>
                    <span className="muted">
                      Level {total.level} · {s.settings.rankTitles[rankIndex]}
                    </span>
                  </div>
                </div>
                <div className="meter-label">
                  <span>Level progress</span>
                  <b>{total.lifetime % 200} / 200 XP</b>
                </div>
                <progress value={total.lifetime % 200} max={200} />
                <div className="meter-label">
                  <span>
                    <Heart size={14} />
                    Virtual HP
                  </span>
                  <b>{total.hp} / 100</b>
                </div>
                <progress className="hp" value={total.hp} max={100} />
                <div className="mini-stats">
                  <div>
                    <b>{total.lifetime}</b>
                    <small>LIFETIME XP</small>
                  </div>
                  <div>
                    <b>{total.xp}</b>
                    <small>SPENDABLE XP</small>
                  </div>
                </div>
                <small className="muted">
                  Game metrics, not health measurements.
                </small>
              </div>
            </div>
            <div className="stats">
              <div className="card">
                <span className="stat-icon">
                  <CheckCheck />
                </span>
                <div>
                  <small>Today's progress</small>
                  <b>
                    {done}
                    <span> / {eligible.length} quests</span>
                  </b>
                  <progress value={done} max={eligible.length || 1} />
                </div>
              </div>
              <div className="card">
                <span className="stat-icon">
                  <Flame />
                </span>
                <div>
                  <small>Training rotation · day {cycle + 1} of 5</small>
                  <b>
                    {s.settings.restDates.includes(today)
                      ? "Rest day"
                      : cycles[cycle]}
                  </b>
                  <small>08:00–09:00 · flexible, never forced</small>
                </div>
              </div>
              <div className="card">
                <span className="stat-icon">
                  <Clock />
                </span>
                <div>
                  <small>
                    Desk progression · week {s.settings.deskWeek + 1}
                  </small>
                  <b>
                    {Math.min(450, 180 + s.settings.deskWeek * 30)}
                    <span> min target</span>
                  </b>
                  <small>
                    {s.settings.stepGoal.toLocaleString()} manual steps ·
                    editable goal
                  </small>
                </div>
              </div>
            </div>
            <div className="grid">
              <section className="card">
                <div className="section-heading">
                  <div>
                    <span className="tag">DAILY MISSIONS</span>
                    <h2>Your essentials</h2>
                  </div>
                  <button onClick={() => setEditor(newTemplate())}>
                    <Plus size={16} />
                    New quest
                  </button>
                </div>
                {current.some(q => !q.proofRequired) ? (
                  questList(current.filter(q => !q.proofRequired))
                ) : (
                  <p className="empty">
                    No quests today. Add a quest or enjoy a planned rest day.
                  </p>
                )}
              </section>
              <aside>
                {surprise && <section className="card surprise-card"><div><span className="tag">TODAY'S SURPRISE · OPEN UNTIL NIGHT</span><h2>{surprise.title.replace(/^Surprise quest:\s*/, "")}</h2><p className="muted">{surprise.description}</p><p className="penalty-note">Miss it: lose 25% of today’s earned XP. If today’s gain is 0 XP, the loss is 0.</p></div><div className="quest-actions"><button onClick={() => setSelectedQuest(surprise)}>View details</button><button className="quest-check" aria-label={surprise.status === "completed" ? `Completed ${surprise.title}` : `Complete ${surprise.title}`} disabled={busy || surprise.status !== "available" || now > Date.parse(surprise.dueAt) + surprise.grace * 60000 || (surprise.proofRequired && !surprise.proofUrl)} onClick={() => requestCompletion(surprise)}>{surprise.status === "completed" ? <Check size={18} /> : <span />}</button>{surprise.proofRequired && <label className="button">{surprise.proofUrl ? "Replace photo" : "Upload photo proof"}<input hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => { const file = e.target.files?.[0]; if (file) safe(async () => { const form = new FormData(); form.append("photo", file); const r = await fetch(`/api/quests/${encodeURIComponent(surprise.id)}/proof`, { method: "POST", headers: { "X-Level-Up": "local" }, body: form }); const data = await r.json(); if (!r.ok) throw Error(data.error); await refresh(); }); }} /></label>}</div></section>}
                <div className="card">
                  <span className="tag">18:30 · CLOSE THE WORKDAY</span>
                  <h2>
                    {activeLog.fatigue === "tired"
                      ? "Choose rest or a gentle walk"
                      : evening[cycle]}
                  </h2>
                  <p className="muted">
                    One easy 10–15 minute activity. Adapt to fatigue and the
                    morning session. No max attempts or extra pulling on
                    pull/arms days.
                  </p>
                  <button
                    onClick={() =>
                      safe(() =>
                        run("/timer", "PUT", { action: "start", minutes: 12 }),
                      )
                    }
                  >
                    Start 12-minute reset <ArrowUpRight size={16} />
                  </button>
                </div>
                <div className="card">
                  <span className="tag">A LITTLE EVIDENCE EVERY DAY</span>
                  <h2>Log today</h2>
                  {logForm}
                </div>
              </aside>
            </div>
          </>
        )}
        {tab === "Quests" && (
          <section className="card">
            <div className="section-heading">
              <div>
                <h2>Build your routine</h2>
                <p className="muted">
                  Templates create dated quests. Editing a template preserves
                  existing instances and history.
                </p>
              </div>
              <button
                className="primary"
                onClick={() => setEditor(newTemplate())}
              >
                <Plus size={16} />
                New quest
              </button>
            </div>
            <div className="template-grid">
              {s.templates.map((t) => (
                <article
                  className={"inset " + (t.archived ? "muted" : "")}
                  key={t.id}
                >
                  <span className="tag">
                    {t.category} · {t.archived ? "ARCHIVED" : t.recurrence}
                  </span>
                  <h3>{t.title}</h3>
                  <p className="muted">
                    {t.start}–{t.end} · {t.timezone}
                    <br />+{t.rewardXp ?? reward[t.difficulty]} XP ·{" "}
                    {t.required
                      ? `bounded penalty up to ${t.penalty} XP/HP`
                      : "optional, no penalty"}
                  </p>
                  <div className="row">
                    <button onClick={() => setEditor(t)}>Edit</button>
                    <button
                      onClick={() =>
                        setEditor({
                          ...t,
                          id: undefined,
                          title: t.title + " (copy)",
                          startDate: today,
                        })
                      }
                    >
                      Duplicate
                    </button>
                    {!t.archived && (
                      <button
                        onClick={() =>
                          safe(() =>
                            run(
                              "/templates/" + t.id,
                              "DELETE",
                              {},
                              "Template archived; open instances cancelled",
                            ),
                          )
                        }
                      >
                        Archive
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
            <div className="inset">
              <h3>Optional AI quest proposals</h3>
              <p>
                Disabled by default. With consent, sends only routine times and
                preferences for meditation, hygiene, study and balanced meals.
                No measurements, logs or identity. Five requests/day. Every
                proposal requires your review.
              </p>
              <button
                disabled={
                  !s.settings.aiEnabled || !s.integrations.aiConfigured || busy
                }
                onClick={() =>
                  safe(async () => {
                    const v = await run(
                      "/ai/proposals",
                      "POST",
                      { consent: true },
                      "Proposals ready for review",
                    );
                    setProposals(v.proposals);
                  })
                }
              >
                Consent & request proposals
              </button>
              {(!s.settings.aiEnabled || !s.integrations.aiConfigured) && (
                <p className="muted">
                  Enable in Settings and configure the server endpoint/model.
                  Your regular routine works without AI.
                </p>
              )}
              {proposals.map((p, i) => (
                <article key={i}>
                  <h3>{p.title}</h3>
                  <p>
                    {p.reason} Recovery alternative: {p.recoveryAlternative}
                  </p>
                  <button
                    onClick={() =>
                      setEditor({
                        ...newTemplate(),
                        ...p,
                        start: p.window.start,
                        end: p.window.end,
                        description:
                          p.reason +
                          " Recovery alternative: " +
                          p.recoveryAlternative,
                        required: false,
                        penalty: 0,
                      })
                    }
                  >
                    Review in quest editor
                  </button>
                </article>
              ))}
            </div>
          </section>
        )}
        {tab === "Timeline" && (
          <section className="card">
            <div className="section-heading">
              <div>
                <h2>Your daily rhythm</h2>
                <p className="muted">
                  Drag an open quest to another day, or use its Reschedule
                  button. Snooze never changes a deadline.
                </p>
              </div>
              <div className="row">
                <input
                  aria-label="Agenda date"
                  type="date"
                  value={agenda || today}
                  onChange={(e) => setAgenda(e.target.value)}
                />
                <button onClick={() => setWeek(!week)}>
                  {week ? "Show day" : "Show week"}
                </button>
                <a className="button" href="/api/calendar.ics">
                  Export .ics
                </a>
              </div>
            </div>
            <p className="muted small">
              Calendar export is a snapshot with stable UIDs. Repeated imports
              may duplicate events in some calendar clients.
            </p>
            {Array.from({ length: week ? 7 : 1 }, (_, i) =>
              DateTime.fromISO(agenda || today)
                .plus({ days: i })
                .toISODate()!,
            ).map((day) => (
              <div
                className="agenda-day"
                key={day}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const q = s.instances.find(
                    (q) => q.id === e.dataTransfer.getData("text/plain"),
                  );
                  if (q) {
                    const open = DateTime.fromISO(q.opensAt).setZone(
                        q.timezone,
                      ),
                      due = DateTime.fromISO(q.dueAt);
                    const moved = DateTime.fromISO(
                      day + "T" + open.toFormat("HH:mm"),
                      { zone: q.timezone },
                    );
                    safe(() =>
                      run(
                        `/quests/${encodeURIComponent(q.id)}/reschedule`,
                        "POST",
                        {
                          opensAt: moved.toUTC().toISO(),
                          dueAt: moved
                            .plus({
                              milliseconds: due.toMillis() - open.toMillis(),
                            })
                            .toUTC()
                            .toISO(),
                        },
                      ),
                    );
                  }
                }}
              >
                <div className="section-heading">
                  <h3>{DateTime.fromISO(day).toFormat("ccc, dd LLL")}</h3>
                  <button
                    onClick={() =>
                      safe(() =>
                        run(
                          "/settings",
                          "PUT",
                          {
                            ...s.settings,
                            restDates: [
                              ...new Set([...s.settings.restDates, day]),
                            ],
                          },
                          "Rest day set; open quests will be excused",
                        ),
                      )
                    }
                  >
                    Plan rest day
                  </button>
                </div>
                {s.instances
                  .filter(
                    (q) => localDate(q.opensAt, s.settings.timezone) === day,
                  )
                  .map(questRow)}
              </div>
            ))}
          </section>
        )}
        {tab === "Character" && (
          <>
            <div className="grid">
              <div className="card character-full">
                <div className="rank-emblem">
                  <Shield size={68} />
                </div>
                <span className="tag">ORIGINAL AVATAR PLACEHOLDER</span>
                <h2>
                  {s.settings.name} · Level {total.level}
                </h2>
                <h3>
                  {["E", "D", "C", "B", "A", "S"][rankIndex]} /{" "}
                  {s.settings.rankTitles[rankIndex]}
                </h3>
                <p>
                  {total.lifetime} lifetime XP · {total.xp} spendable XP ·{" "}
                  {total.hp} virtual HP
                </p>
                <p className="muted">
                  Habit scores and virtual HP are game metrics, not measured
                  physiology. Rank titles are app-defined and editable.
                </p>
                <h3>Achievements</h3>
                {s.ledger
                  .filter((l) => l.kind === "weekly")
                  .map((l) => (
                    <p key={l.id}>✦ {l.key} · +50 XP</p>
                  ))}
                {!s.ledger.some((l) => l.kind === "weekly") && (
                  <p className="muted">
                    Complete ≥80% of eligible required quests across at least 3
                    eligible days in a closed ISO week to earn +50 XP.
                  </p>
                )}
                <p>
                  Current streak:{" "}
                  {(() => {
                    let count = 0;
                    for (let i = 0; i < 366; i++) {
                      const day = DateTime.fromISO(today)
                        .minus({ days: i })
                        .toISODate();
                      const qs = s.instances.filter(
                        (q) =>
                          q.occurrence === day &&
                          q.required &&
                          !["excused", "cancelled"].includes(q.status),
                      );
                      if (!qs.length) continue;
                      if (qs.every((q) => q.status === "completed")) count++;
                      else if (i > 0) break;
                    }
                    return count;
                  })()}{" "}
                  eligible days
                </p>
              </div>
              <div className="card">
                <h2>Six habits, one steady practice</h2>
                <HabitRadar scores={total.scores} />
                <table>
                  <thead>
                    <tr>
                      <th>Game metric</th>
                      <th>Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((c) => (
                      <tr key={c}>
                        <td>{c}</td>
                        <td>{total.scores[c]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <Ledger s={s} />
          </>
        )}
        {tab === "Progress" && (
          <>
            <div className="section-heading">
              <div>
                <h2>Evidence of progress</h2>
                <p className="muted">
                  Your measurements only. Missing days remain gaps.
                </p>
              </div>
              <div className="row">
                {[7, 30, 90].map((d) => (
                  <button
                    className={days === d ? "active" : ""}
                    key={d}
                    onClick={() => setDays(d)}
                  >
                    {d} days
                  </button>
                ))}
              </div>
            </div>
            <div className="chart-grid">
              {[
                ["Weight & 7-day average", "weight", "kg", "average"],
                ["Manual steps", "steps", "steps", "target"],
                ["Sleep", "sleep", "hours"],
                ["Desk time", "desk", "minutes"],
                ["Waist", "waist", "inches"],
                ["Pull-ups", "pullups", "reps"],
                ["Handstand", "handstand", "seconds"],
                ["Quest completion", "completion", "%"],
                ["Spendable XP change", "xp", "XP"],
                ["Virtual HP change", "hp", "HP"],
                ["Spendable XP balance", "xpBalance", "XP"],
                ["Virtual HP balance", "hpBalance", "HP"],
              ].map(([title, key, unit, second]) => (
                <Chart
                  key={key}
                  title={title}
                  field={key}
                  unit={unit}
                  data={stats}
                  secondary={second}
                />
              ))}
              <div className="card">
                <h2>Habit radar</h2>
                <p className="muted">Cumulative game points</p>
                <HabitRadar scores={total.scores} />
              </div>
            </div>
            <div className="card">
              <h2>Add a measurement</h2>
              {logForm}
            </div>
          </>
        )}
        {tab === "Nutrition" && (
          <div className="grid">
            <section className="card">
              <span className="tag">FUEL YOUR ROUTINE</span>
              <h2>Eat for a sustainable comeback</h2>
              <p className="muted">
                Meal building blocks, not calorie-verified prescriptions. Use
                actual labels and quantities if you choose to track nutrients.
                No penalties for eating or body weight.
              </p>
              {[
                [
                  "After training",
                  "Two eggs, curd or milk, fruit; add oats or roti if needed.",
                ],
                [
                  "Lunch",
                  "Soy or chickpeas, vegetables, curd and a comfortable rice portion.",
                ],
                [
                  "Snack",
                  "Fruit with curd or milk, planned before you become very hungry.",
                ],
                [
                  "Dinner",
                  "Rice, vegetables and dal. Chicken on your usual 3–4 days/week, soy or tofu on other days.",
                ],
              ].map(([title, body]) => (
                <div className="plan" key={title}>
                  <h3>{title}</h3>
                  <p>{body}</p>
                  <button
                    onClick={() => {
                      setLog({
                        ...activeLog,
                        food:
                          activeLog.food +
                          (activeLog.food ? "\n" : "") +
                          title +
                          ": " +
                          body,
                        provenance:
                          "Meal template selected; edit to record what you actually ate",
                      });
                      setToast(
                        "Added to food log draft. Edit quantities before saving.",
                      );
                    }}
                  >
                    Use as food-log draft
                  </button>
                </div>
              ))}
              <p>
                Keep rice changes gradual. Serve a comfortable plate and
                reassess hunger. Do not skip your next meal to compensate. Food
                amounts and oil vary; this app does not invent calorie or
                protein totals.
              </p>
            </section>
            <aside>
              <section className="card">
                <h2>Actual food log</h2>
                <label>
                  Date
                  <input
                    type="date"
                    max={today}
                    value={activeLog.date}
                    onChange={(e) =>
                      setLog(
                        s.logs.find((l) => l.date === e.target.value) ??
                          blankLog(e.target.value),
                      )
                    }
                  />
                </label>
                <label>
                  Food, quantities & preparation
                  <textarea
                    value={activeLog.food}
                    onChange={(e) => editLog("food", e.target.value)}
                    placeholder="What you actually ate; optional portions and labels"
                  />
                </label>
                <label>
                  Source / provenance
                  <input
                    value={activeLog.provenance}
                    onChange={(e) => editLog("provenance", e.target.value)}
                  />
                </label>
                <button
                  className="primary"
                  onClick={() =>
                    safe(async () => {
                      await run("/logs", "PUT", activeLog);
                      setLog(null);
                    })
                  }
                >
                  Save food log
                </button>
              </section>
              <section className="card">
                <h2>Recovery & everyday care</h2>
                <div className="plan">
                  <b>Morning grooming</b>
                  <p>
                    Brush, shower after training, change sweaty clothes and comb
                    hair.
                  </p>
                </div>
                <div className="plan">
                  <b>Evening reset</b>
                  <p>
                    Brush, clean between teeth, prepare clothes and desk, then
                    five quiet minutes of meditation.
                  </p>
                </div>
                <div className="plan">
                  <b>Sleep & recovery</b>
                  <p>
                    Make time to wind down. Adapt optional practice to fatigue;
                    a rest day is part of your routine.
                  </p>
                </div>
              </section>
            </aside>
          </div>
        )}
        {tab === "Weekly review" && <Review s={s} today={today} />}
        {tab === "Settings" && (
          <>
            <div className="card">
              <h2>Make the plan yours</h2>
              <p className="muted">
                Private single-owner app with a persistent secure login cookie.
                Existing quest windows keep their stored timezone and grace;
                settings apply to new quests.
              </p>
              <SettingsForm
                value={settings ?? s.settings}
                onChange={setSettings}
              />
              <button
                className="primary"
                onClick={() =>
                  safe(() =>
                    run(
                      "/settings",
                      "PUT",
                      settings ?? s.settings,
                      "Settings saved",
                    ),
                  )
                }
              >
                Save settings
              </button>
            </div>
            <div className="grid">
              <section className="card">
                <h2>Reminders & diagnostics</h2>
                <p>
                  Browser alerts need an open tab. Desktop alerts need the local
                  scheduler and an awake graphical Ubuntu session. Push is
                  best-effort and requires VAPID configuration. No channel can
                  guarantee delivery while the laptop is asleep or powered off.
                </p>
                <p>
                  Selected: <b>{s.settings.notifications}</b> · Browser
                  permission:{" "}
                  {"Notification" in window
                    ? Notification.permission
                    : "unsupported"}
                </p>
                <div className="row">
                  <button
                    onClick={() =>
                      safe(async () => {
                        if (!("Notification" in window))
                          throw Error("Notifications unsupported");
                        const p = await Notification.requestPermission();
                        setToast("Browser permission: " + p);
                      })
                    }
                  >
                    Enable browser permission
                  </button>
                  <button
                    onClick={() =>
                      safe(() =>
                        run(
                          "/notifications/test",
                          "POST",
                          {},
                          "Test queued; see delivery status below",
                        ),
                      )
                    }
                  >
                    Send test notification
                  </button>
                  <button
                    disabled={!s.integrations.pushConfigured}
                    onClick={() =>
                      safe(async () => {
                        const p = await Notification.requestPermission();
                        if (p !== "granted")
                          throw Error("Notification permission required");
                        const reg =
                          await navigator.serviceWorker.register("/sw.js");
                        await navigator.serviceWorker.ready;
                        const { key } = await api("/push/key");
                        const raw = atob(
                          key.replace(/-/g, "+").replace(/_/g, "/"),
                        );
                        const sub = await reg.pushManager.subscribe({
                          userVisibleOnly: true,
                          applicationServerKey: Uint8Array.from(raw, (c) =>
                            c.charCodeAt(0),
                          ),
                        });
                        await run("/push/subscribe", "POST", sub.toJSON());
                      })
                    }
                  >
                    Subscribe to Web Push
                  </button>
                </div>
                <p className="muted">
                  Desktop configured:{" "}
                  {s.integrations.desktopConfigured ? "yes" : "no"} · Push
                  configured: {s.integrations.pushConfigured ? "yes" : "no"}
                </p>
                <details>
                  <summary>Recent delivery jobs ({s.jobs.length})</summary>
                  {s.jobs
                    .slice(-20)
                    .reverse()
                    .map((j) => (
                      <p key={j.id}>
                        {j.channel} · {j.status} · {j.error ?? j.at}
                      </p>
                    ))}
                </details>
              </section>
              <section className="card">
                <h2>Calendar & AI</h2>
                <p>
                  Google Calendar:{" "}
                  {s.integrations.calendarConnected
                    ? "Connected"
                    : s.integrations.calendarConfigured
                      ? "Ready to connect"
                      : "Not configured"}
                  . The app is authoritative for completion. Sync only touches a
                  separate Level Up calendar; no invitees.
                </p>
                <div className="row">
                  <a className="button" href="/api/calendar.ics">
                    <Download size={16} />
                    Calendar snapshot
                  </a>
                  <button
                    disabled={!s.integrations.calendarConfigured}
                    onClick={() =>
                      safe(async () => {
                        const v = await run("/calendar/connect");
                        window.location.assign(v.url);
                      })
                    }
                  >
                    Connect Google
                  </button>
                  <button
                    disabled={!s.integrations.calendarConnected}
                    onClick={() =>
                      safe(() =>
                        run(
                          "/calendar/sync",
                          "POST",
                          {},
                          "Selected categories synced",
                        ),
                      )
                    }
                  >
                    Sync now
                  </button>
                  <button
                    disabled={!s.integrations.calendarConnected}
                    onClick={() => safe(() => run("/calendar/disconnect"))}
                  >
                    Disconnect & revoke
                  </button>
                </div>
                <p className="muted">
                  AI provider:{" "}
                  {s.integrations.aiConfigured
                    ? "Configured"
                    : "Not configured"}{" "}
                  · {s.settings.aiEnabled ? "Enabled" : "Disabled"}. Configure
                  server-side endpoint/model in .env; review proposals in
                  Quests. Local Ollama and OpenAI-compatible endpoints are
                  supported.
                </p>
              </section>
            </div>
            <section className="card">
              <h2>Your data, under your control</h2>
              <p>
                Backups contain personal logs. No analytics or automatic
                external sync. Import is validated before replacement, and a
                pre-import backup is saved on this machine. Provider credentials
                are excluded.
              </p>
              <div className="row">
                <a className="button" href="/api/backup">
                  <Download size={16} />
                  Export backup
                </a>
                <label>
                  Preview backup / prototype import
                  <input
                    type="file"
                    accept="application/json"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f)
                        safe(async () => {
                          if (f.size > 10000000)
                            throw Error("Backup exceeds 10 MB");
                          const v = await api(
                            "/backup/preview",
                            "POST",
                            JSON.parse(await f.text()),
                          );
                          setPreview(v);
                        });
                    }}
                  />
                </label>
              </div>
              {preview && (
                <div className="inset">
                  <h3>Review replacement</h3>
                  <p>
                    {preview.logs} logs · {preview.quests} dated quests ·{" "}
                    {preview.ledger} ledger events
                  </p>
                  <p>{preview.warning}</p>
                  {preview.legacy && (
                    <p>
                      Legacy measurements are imported. Untimed checkmarks are
                      preserved in the audit, not converted into timed
                      completions or XP.
                    </p>
                  )}
                  <button
                    className="primary"
                    onClick={() =>
                      safe(async () => {
                        await run(
                          "/backup/restore",
                          "POST",
                          { token: preview.token },
                          "Backup restored; previous data saved to data/backups",
                        );
                        setPreview(null);
                      })
                    }
                  >
                    Replace local data
                  </button>
                  <button onClick={() => setPreview(null)}>
                    Cancel import
                  </button>
                </div>
              )}
              <details>
                <summary>Audit history</summary>
                {s.audit
                  .slice(-100)
                  .reverse()
                  .map((a) => (
                    <p key={a.id}>
                      <b>{a.action}</b> · {a.at}
                      <br />
                      {a.detail}
                    </p>
                  ))}
              </details>
            </section>
          </>
        )}
        <footer>
          <span>
            ◈ LEVEL UP{" "}
            <span className="muted">· Designed for {s.settings.name}</span>
          </span>
          <span>
            XP rewards habits, not weight loss. Rest is part of the plan.
          </span>
          <span className="muted">Local self-tracking · not cheat-proof</span>
        </footer>
      </main>
      {editor && (
        <QuestEditor
          value={editor}
          onClose={() => setEditor(null)}
          onSave={async (v) => {
            await run(
              "/templates" + (editor.id ? "/" + editor.id : ""),
              editor.id ? "PUT" : "POST",
              v,
            );
            setEditor(null);
          }}
        />
      )}
      {modal && (
        <ActionModal
          value={modal}
          onClose={() => setModal(null)}
          onSave={async (v) => {
            await run(
              `/quests/${encodeURIComponent(modal.q.id)}/${modal.action}`,
              "POST",
              v,
            );
            setModal(null);
          }}
        />
      )}
      {selectedQuest && <Dialog title={selectedQuest.title} onClose={() => setSelectedQuest(null)}><p>{selectedQuest.description}</p><p><b>{dateTime(selectedQuest.opensAt)}–{dateTime(selectedQuest.dueAt)}</b> · {selectedQuest.category} · {selectedQuest.status}</p><p>{selectedQuest.proofRequired ? "Photo proof is required. This surprise quest stays open until its stated deadline. Missing it deducts 25% of today’s positive XP gain; 0 XP gained means 0 XP lost." : `Complete by the due time plus ${selectedQuest.grace} minutes of grace.`}</p><p>Reward: +{selectedQuest.rewardXp ?? reward[selectedQuest.difficulty]} XP {selectedQuest.required ? `· missed penalty up to ${selectedQuest.penalty} HP/XP` : selectedQuest.proofRequired ? "· surprise penalty applies if missed" : "· optional, no penalty"}</p></Dialog>}
      <button className="agent-fab" onClick={() => setAgentOpen(v => !v)}>{agentOpen ? "Close" : "Ask Agent"}</button>
      {agentOpen && <aside className="agent-window card"><div className="row spread"><div><span className="tag">PRIVATE GEMINI AGENT</span><h2>Ask about your day</h2></div><button onClick={() => setAgentOpen(false)}>×</button></div><div className="chat-log">{chat.map((m, i) => <div className={`chat ${m.role}`} key={i}><b>{m.role === "user" ? "You" : "Agent"}</b>{m.role === "agent" ? <div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown></div> : <p>{m.text}</p>}</div>)}</div><form onSubmit={(e) => { e.preventDefault(); void sendAgent(); }}><label>Message<textarea value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} placeholder="What remains today?" /></label><small className="muted">Enter sends · Shift+Enter adds a new line</small><button className="primary" disabled={busy}>{busy ? "Thinking…" : "Send"}</button></form></aside>}
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
        </div>
      )}
    </>
  );
}
function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog ref={ref} aria-label={title} onCancel={onClose}>
      <div className="section-heading">
        <h2>{title}</h2>
        <button aria-label="Close dialog" onClick={onClose}>
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
function QuestEditor({
  value,
  onClose,
  onSave,
}: {
  value: Partial<Template>;
  onClose: () => void;
  onSave: (v: any) => Promise<void>;
}) {
  const [v, set] = useState(value),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const field = (key: string, val: any) => set({ ...v, [key]: val });
  return (
    <Dialog
      title={v.id ? "Edit quest template" : "New quest"}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          void onSave(v)
            .catch((e) => setError(e.message))
            .finally(() => setBusy(false));
        }}
      >
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <label>
          Title
          <input
            required
            maxLength={120}
            value={v.title}
            onChange={(e) => field("title", e.target.value)}
            autoFocus
          />
        </label>
        <label>
          Description
          <textarea
            value={v.description}
            onChange={(e) => field("description", e.target.value)}
          />
        </label>
        <div className="form-grid">
          <label>
            Category
            <select
              value={v.category}
              onChange={(e) => field("category", e.target.value)}
            >
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Habit type
            <select
              value={v.habit ?? "general"}
              onChange={(e) => field("habit", e.target.value)}
            >
              {[
                "general",
                "training",
                "walking",
                "skills",
                "nutrition",
                "body-weight",
                "hygiene",
                "hair-care",
                "meditation",
                "sleep",
              ].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Difficulty
            <select
              value={v.difficulty}
              onChange={(e) => field("difficulty", e.target.value)}
            >
              {["easy", "normal", "hard"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Recurrence
            <select
              value={v.recurrence}
              onChange={(e) => field("recurrence", e.target.value)}
            >
              {["daily", "weekdays", "once"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Timezone
            <input
              required
              value={v.timezone}
              onChange={(e) => field("timezone", e.target.value)}
            />
          </label>
          <label>
            First date
            <input
              required
              type="date"
              value={v.startDate}
              onChange={(e) => field("startDate", e.target.value)}
            />
          </label>
          <label>
            Start time
            <input
              required
              type="time"
              value={v.start}
              onChange={(e) => field("start", e.target.value)}
            />
          </label>
          <label>
            End time
            <input
              required
              type="time"
              value={v.end}
              onChange={(e) => field("end", e.target.value)}
            />
          </label>
          {[
            ["grace", "Grace minutes", 0, 120],
            ["target", "Completion target", 1, 100000],
            ["reminderLead", "Reminder lead minutes", 0, 120],
            ["penalty", "Maximum XP/HP penalty", 0, 5],
          ].map(([k, label, min, max]) => (
            <label key={k}>
              {label}
              <input
                required
                type="number"
                min={min}
                max={max}
                value={(v as any)[k]}
                onChange={(e) => field(String(k), Number(e.target.value))}
              />
            </label>
          ))}
        </div>
        <label className="check-label">
          <input
            type="checkbox"
            checked={v.required}
            onChange={(e) => field("required", e.target.checked)}
          />
          Required quest (bounded virtual penalties)
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={v.archived}
            onChange={(e) => field("archived", e.target.checked)}
          />
          Archived template
        </label>
        <label className="check-label"><input type="checkbox" checked={v.proofRequired ?? false} onChange={(e) => field("proofRequired", e.target.checked)} />Require photo proof</label>
        <p className="inset">
          Reward: +{v.rewardXp ?? reward[v.difficulty ?? "normal"]} lifetime &
          spendable XP, +2 virtual HP (cap 100), +
          {reward[v.difficulty ?? "normal"] / 10} category points.{" "}
          {v.required
            ? `Missed: up to ${v.penalty} XP/HP, within daily caps.`
            : "Optional: no missed penalty."}{" "}
          Food and body-weight habits never receive penalties. End before start
          means next day.
        </p>
        {v.id && (
          <p className="muted">
            Existing dated instances stay unchanged. Use Timeline to reschedule
            open instances.
          </p>
        )}
        <button type="submit" className="primary" disabled={busy}>
          Save quest
        </button>
      </form>
    </Dialog>
  );
}
function ActionModal({
  value,
  onClose,
  onSave,
}: {
  value: { q: Instance; action: "complete" | "correct" | "reschedule"; value?: number };
  onClose: () => void;
  onSave: (v: any) => Promise<void>;
}) {
  const { q, action } = value,
    local = (v: string) =>
      DateTime.fromISO(v).setZone(q.timezone).toFormat("yyyy-MM-dd'T'HH:mm");
  const [start, setStart] = useState(local(q.opensAt)),
    [end, setEnd] = useState(local(q.dueAt)),
    [at, setAt] = useState(local(q.dueAt)),
    [note, setNote] = useState(""),
    [error, setError] = useState("");
  const utc = (v: string) =>
    DateTime.fromISO(v, { zone: q.timezone }).toUTC().toISO();
  return (
    <Dialog
      title={
        action === "complete"
          ? "Confirm completion"
          : action === "correct"
          ? "I did this on time; forgot to log it"
          : "Reschedule quest"
      }
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void onSave(
            action === "complete"
              ? (q.habit === "walking" && q.target > 1 ? { value: value.value } : {})
              : action === "correct"
              ? { completedAt: utc(at), note }
              : { opensAt: utc(start), dueAt: utc(end), note },
          ).catch((e) => setError(e.message));
        }}
      >
        <p>
          {q.title} · {q.timezone}
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {action === "complete" ? (
          <>
            <p>Mark <b>{q.title}</b> complete? This is permanent and cannot be unchecked.</p>
            {q.habit === "walking" && q.target > 1 && <p>Recorded steps: <b>{value.value?.toLocaleString()}</b> / {q.target.toLocaleString()}.</p>}
          </>
        ) : action === "correct" ? (
          <>
            <p>
              This records your claimed actual time and an audit note, and
              reverses the original penalty once.
            </p>
            <label>
              Actual completion time
              <input
                required
                type="datetime-local"
                value={at}
                onChange={(e) => setAt(e.target.value)}
              />
            </label>
          </>
        ) : (
          <>
            <label>
              Opens at
              <input
                required
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            <label>
              Due at
              <input
                required
                type="datetime-local"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </label>
          </>
        )}
        {action !== "complete" && <label>
          Audit note
          <textarea
            required={action === "correct"}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>}
        <button className="primary" type="submit">
          {action === "complete" ? "Confirm completion" : action === "correct" ? "Save correction" : "Save new window"}
        </button>
      </form>
    </Dialog>
  );
}
function SettingsForm({
  value: v,
  onChange,
}: {
  value: Settings;
  onChange: (v: Settings) => void;
}) {
  const field = (k: string, val: any) => onChange({ ...v, [k]: val });
  return (
    <>
      <div className="form-grid settings-grid">
        {[
          ["name", "Name"],
          ["timezone", "Timezone"],
        ].map(([k, label]) => (
          <label key={k}>
            {label}
            <input
              value={(v as any)[k]}
              onChange={(e) => field(k, e.target.value)}
            />
          </label>
        ))}
        {[
          ["age", "Age", 18, 120],
          ["height", "Height (cm)", 80, 250],
          ["startingWeight", "Starting weight (kg, self-reported)", 30, 300],
          ["goalWeight", "Goal weight (kg)", 30, 300],
          ["stepGoal", "Manual step goal", 0, 100000],
          ["deskWeek", "Desk progression week (0 = first week)", 0, 9],
          ["rotationOffset", "Rotation offset (0 Push to 4 Basketball)", 0, 4],
          ["grace", "Default grace minutes", 0, 120],
        ].map(([k, label, min, max]) => (
          <label key={k}>
            {label}
            <input
              type="number"
              step={String(k).includes("Weight") ? ".1" : "1"}
              min={min}
              max={max}
              value={(v as any)[k]}
              onChange={(e) => field(String(k), Number(e.target.value))}
            />
          </label>
        ))}
        <label>
          Rotation anchor
          <input
            type="date"
            value={v.rotationAnchor}
            onChange={(e) => field("rotationAnchor", e.target.value)}
          />
        </label>
        {[
          ["wake", "Wake"],
          ["workStart", "Work starts"],
          ["workEnd", "Work ends"],
          ["lunch", "Lunch begins (1-hour break)"],
          ["quietStart", "Quiet hours start"],
          ["quietEnd", "Quiet hours end"],
        ].map(([k, label]) => (
          <label key={k}>
            {label}
            <input
              type="time"
              value={(v as any)[k]}
              onChange={(e) => field(k, e.target.value)}
            />
          </label>
        ))}
        <label>
          Virtual penalty mode
          <select
            value={v.penaltyMode}
            onChange={(e) => field("penaltyMode", e.target.value)}
          >
            <option value="standard">Standard · max 20/day</option>
            <option value="soft">Softer · max 10/day, 2/quest</option>
            <option value="paused">Paused · no new penalties</option>
          </select>
        </label>
        <label>
          Notification channel
          <select
            value={v.notifications}
            onChange={(e) => field("notifications", e.target.value)}
          >
            {["off", "browser", "desktop", "push"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted">
        Desk progression is manual: leave the week unchanged to repeat it.
        Rotation offset can hold or advance the cycle independently. Work and
        lunch preferences guide your plan; edit routine templates separately to
        alter scheduled quests.
      </p>
      <fieldset>
        <legend>Working weekdays</legend>
        <div className="row">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => (
            <label className="check-label" key={d}>
              <input
                type="checkbox"
                checked={v.weekdays.includes(i + 1)}
                onChange={(e) =>
                  field(
                    "weekdays",
                    e.target.checked
                      ? [...v.weekdays, i + 1]
                      : v.weekdays.filter((x) => x !== i + 1),
                  )
                }
              />
              {d}
            </label>
          ))}
        </div>
      </fieldset>
      <label>
        Rest / vacation dates (comma separated)
        <input
          value={v.restDates.join(", ")}
          onChange={(e) =>
            field(
              "restDates",
              e.target.value
                .split(",")
                .map((v) => v.trim())
                .filter(Boolean),
            )
          }
        />
      </label>
      <label>
        Focus mode until (ISO instant; clear to resume)
        <input
          value={v.focusUntil}
          onChange={(e) => field("focusUntil", e.target.value)}
        />
      </label>
      <fieldset>
        <legend>App-defined rank titles</legend>
        <div className="form-grid">
          {v.rankTitles.map((title, i) => (
            <label key={i}>
              {
                [
                  "E · levels 1–4",
                  "D · levels 5–9",
                  "C · levels 10–19",
                  "B · levels 20–34",
                  "A · levels 35–49",
                  "S · levels 50+",
                ][i]
              }
              <input
                value={title}
                onChange={(e) =>
                  field(
                    "rankTitles",
                    v.rankTitles.map((v, j) => (i === j ? e.target.value : v)),
                  )
                }
              />
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Calendar categories to export/sync</legend>
        <div className="row">
          {categories.map((c) => (
            <label key={c} className="check-label">
              <input
                type="checkbox"
                checked={v.calendarCategories.includes(c)}
                onChange={(e) =>
                  field(
                    "calendarCategories",
                    e.target.checked
                      ? [...v.calendarCategories, c]
                      : v.calendarCategories.filter((x) => x !== c),
                  )
                }
              />
              {c}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="check-label">
        <input
          type="checkbox"
          checked={v.aiEnabled}
          onChange={(e) => field("aiEnabled", e.target.checked)}
        />
        Enable optional AI proposals (explicit consent per request)
      </label>
    </>
  );
}
function Ledger({ s }: { s: State }) {
  return (
    <section className="card">
      <h2>Reversible score ledger</h2>
      <p className="muted">
        Lifetime earned XP never decreases. Undo removes current reward effects;
        the original lifetime award stays recorded, and re-completing cannot
        earn it again.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Date / event</th>
              <th>Lifetime</th>
              <th>Spendable</th>
              <th>HP</th>
              <th>Category</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {s.ledger
              .slice()
              .reverse()
              .map((l) => (
                <tr key={l.id}>
                  <td>
                    {l.date}
                    <small>{l.kind}</small>
                  </td>
                  <td>{l.lifetime}</td>
                  <td>{l.xp}</td>
                  <td>{l.hp}</td>
                  <td>
                    {l.category ?? "—"} {l.points || ""}
                  </td>
                  <td>
                    {l.reversed ? "Reversed (lifetime retained)" : "Applied"}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function Review({ s, today }: { s: State; today: string }) {
  const start = DateTime.fromISO(today).startOf("week");
  const summarize = (offset: number) => {
    const from = start.minus({ weeks: offset }).toISODate()!,
      to = start.minus({ weeks: offset }).plus({ days: 6 }).toISODate()!;
    const qs = s.instances.filter(
      (q) =>
        q.occurrence >= from &&
        q.occurrence <= to &&
        q.required &&
        !["excused", "cancelled"].includes(q.status) &&
        ["completed", "missed"].includes(q.status),
    );
    return {
      from,
      to,
      qs,
      done: qs.filter((q) => q.status === "completed").length,
    };
  };
  const a = summarize(0),
    b = summarize(1);
  return (
    <>
      <div className="grid">
        <section className="card feature">
          <span className="tag">REFLECT, DON'T PUNISH</span>
          <h2>Your weekly review</h2>
          <p>
            {a.from} – {a.to}
          </p>
          <div className="big">
            {a.qs.length
              ? Math.round((a.done / a.qs.length) * 100) + "%"
              : "No data"}
          </div>
          <p>
            {a.done} completed / {a.qs.length} resolved eligible required
            quests. Upcoming quests are not yet included. Excused and cancelled
            quests are excluded.
          </p>
          <p>
            Previous week:{" "}
            {b.qs.length
              ? Math.round((b.done / b.qs.length) * 100) + "%"
              : "No data"}{" "}
            · {b.done}/{b.qs.length}
          </p>
          <p className="muted">
            Deterministic review. No model or external data sharing needed.
          </p>
        </section>
        <section className="card">
          <h2>Wins & a realistic next step</h2>
          <p>
            {a.done
              ? `You followed through on ${a.done} required quests. Keep the routines that fit your day.`
              : "Start with one small, achievable quest. No catch-up workout is needed."}
          </p>
          {categories.map((c) => {
            const q = a.qs.filter((q) => q.category === c),
              miss = q.filter((q) => q.status === "missed").length;
            return (
              <div className="review-row" key={c}>
                <span>{c}</span>
                <b>{q.length ? `${q.length - miss}/${q.length}` : "No data"}</b>
                <small>
                  {miss
                    ? "Consider a smaller target or a better time window."
                    : "Keep it comfortable and repeatable."}
                </small>
              </div>
            );
          })}
          <p>
            Repeat the desk progression week if actual minutes are inconsistent.
            Choose rest when tired; adjust tomorrow's window instead of adding
            punishment.
          </p>
        </section>
      </div>
      <Ledger s={s} />
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.Suspense
    fallback={
      <main>
        <p role="status">Loading charts…</p>
      </main>
    }
  >
    <App />
  </React.Suspense>,
);
