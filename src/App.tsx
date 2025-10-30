import React, { useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend } from "recharts";

// 👇 paste your actual Apps Script web app URL here
const SHEET_WEBAPP_URL = import.meta.env.VITE_SHEET_WEBAPP_URL as string;
console.log("[env] SHEET_WEBAPP_URL:", SHEET_WEBAPP_URL);

if (!SHEET_WEBAPP_URL) {
  console.warn("VITE_SHEET_WEBAPP_URL no está definida. Revisa .env.local o variables en Vercel.");
}

// Fire-and-forget: we don’t need to read the response
async function sendToSheet(record: any) {
  try {
    await fetch(SHEET_WEBAPP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
      mode: "no-cors",             // <- avoids CORS issues
      keepalive: true              // <- helps when user navigates away
    });
  } catch (err) {
    console.warn("Send to Sheet failed (will remain local):", err);
  }
}

/**
 * Microdosing Journal – Single-file React app
 * - Asks you a structured set of questions
 * - Saves entries to localStorage (privacy-first, stays on your device)
 * - Lets you customize prompts, export/import your data (CSV/JSON)
 * - Simple trends dashboard for Mood / Anxiety / Focus
 *
 * Notes:
 * - This is a client-side prototype. For multi-device sync, add an auth + database layer (e.g., Supabase/Firebase).
 * - This app does not provide medical advice.
 */

// ----------------------------- Types -----------------------------
const DEFAULT_QUESTIONS = [
  { key: "date", label: "Date", type: "date" },
  { key: "protocol", label: "Protocol (e.g., Fadiman, Stamets, custom)", type: "text" },
  { key: "dayType", label: "Day Type", type: "select", options: ["Dose", "Off", "Rest", "Integration"] },
  { key: "strain", label: "Strain / Variety (optional)", type: "text" },
  { key: "doseMg", label: "Dose (mg)", type: "number", min: 0, step: 1 },
  { key: "timeTaken", label: "Time taken", type: "time" },
  { key: "sleepHours", label: "Sleep last night (hours)", type: "number", min: 0, step: 0.25 },
  { key: "caffeineMg", label: "Caffeine today (mg, optional)", type: "number", min: 0, step: 10 },
  { key: "intention", label: "Intention for today", type: "textarea" },
  { key: "setting", label: "Set & Setting (where / with whom / mindset)", type: "textarea" },
  { key: "mood", label: "Mood (1–10)", type: "range", min: 1, max: 10 },
  { key: "anxiety", label: "Anxiety (1–10)", type: "range", min: 1, max: 10 },
  { key: "focus", label: "Focus (1–10)", type: "range", min: 1, max: 10 },
  { key: "energy", label: "Energy (1–10)", type: "range", min: 1, max: 10 },
  { key: "sideEffects", label: "Side effects (free text)", type: "textarea" },
  { key: "activities", label: "Key activities (workout, study, social, therapy, etc.)", type: "textarea" },
  { key: "notes", label: "Any other observations", type: "textarea" },
];

const STORAGE_KEY = "microdosing_journal_entries_v1";
const STORAGE_QUESTIONS_KEY = "microdosing_journal_questions_v1";

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ----------------------------- Helpers -----------------------------
function toCSV(rows: any[]) {
  if (!rows?.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: any) => {
    if (v === null || v === undefined) return "";
    const str = String(v).replaceAll('"', '""');
    return /[",\n]/.test(str) ? `"${str}"` : str;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(","));
  }
  return lines.join("\n");
}

function parseJSONFile(file: File) {
  return new Promise<any[]>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try { resolve(JSON.parse(String(reader.result))); }
      catch (e) { reject(e); }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

// ----------------------------- Components -----------------------------
function Badge({ children }: { children: React.ReactNode }) {
  return <span className="inline-block rounded-full px-2 py-0.5 text-xs border border-gray-500/30">{children}</span>;
}

function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200/30 bg-white/60 dark:bg-zinc-900/60 shadow-sm p-4 md:p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg md:text-xl font-semibold">{title}</h2>
        <div>{right}</div>
      </div>
      {children}
    </div>
  );
}

function Label({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium mb-1">
      {children}
    </label>
  );
}

function Input({ id, ...props }: any) {
  return (
    <input
      id={id}
      {...props}
      className={
        "w-full rounded-xl border border-gray-300/60 dark:border-zinc-700 bg-white/80 dark:bg-zinc-900 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500" +
        (props.className ? " " + props.className : "")
      }
    />
  );
}

function Textarea({ id, ...props }: any) {
  return (
    <textarea
      id={id}
      {...props}
      className={
        "w-full rounded-xl border border-gray-300/60 dark:border-zinc-700 bg-white/80 dark:bg-zinc-900 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 min-h-[80px]" +
        (props.className ? " " + props.className : "")
      }
    />
  );
}

function Select({ id, options = [], value, onChange }: any) {
  return (
    <select id={id} value={value} onChange={onChange} className="w-full rounded-xl border border-gray-300/60 dark:border-zinc-700 bg-white/80 dark:bg-zinc-900 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500">
      <option value="">— Select —</option>
      {options.map((opt: string) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  );
}

function Range({ id, min = 1, max = 10, value, onChange }: any) {
  return (
    <div className="flex items-center gap-3">
      <input id={id} type="range" min={min} max={max} value={value ?? ""} onChange={onChange} className="flex-1" />
      <Badge>{value ?? "–"}</Badge>
    </div>
  );
}

function QuestionField({ q, value, onChange }: any) {
  const id = `q_${q.key}`;
  switch (q.type) {
    case "text":
    case "number":
    case "date":
    case "time":
      return (
        <div>
          <Label htmlFor={id}>{q.label}</Label>
          <Input id={id} type={q.type} step={q.step} min={q.min} max={q.max} value={value ?? ""} onChange={(e: any) => onChange(e.target.value)} />
        </div>
      );
    case "textarea":
      return (
        <div>
          <Label htmlFor={id}>{q.label}</Label>
          <Textarea id={id} value={value ?? ""} onChange={(e: any) => onChange(e.target.value)} />
        </div>
      );
    case "select":
      return (
        <div>
          <Label htmlFor={id}>{q.label}</Label>
          <Select id={id} value={value ?? ""} onChange={(e: any) => onChange(e.target.value)} options={q.options || []} />
        </div>
      );
    case "range":
      return (
        <div>
          <Label htmlFor={id}>{q.label}</Label>
          <Range id={id} min={q.min} max={q.max} value={value ?? 5} onChange={(e: any) => onChange(Number(e.target.value))} />
        </div>
      );
    default:
      return null;
  }
}

function QuestionsEditor({ questions, setQuestions }: any) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(JSON.stringify(questions, null, 2));

  useEffect(() => setDraft(JSON.stringify(questions, null, 2)), [questions]);

  function save() {
    try {
      const parsed = JSON.parse(draft);
      if (!Array.isArray(parsed)) throw new Error("Questions must be an array");
      setQuestions(parsed);
      localStorage.setItem(STORAGE_QUESTIONS_KEY, JSON.stringify(parsed));
      setOpen(false);
    } catch (e: any) {
      alert("Invalid JSON for questions: " + e.message);
    }
  }

  return (
    <div>
      <button onClick={() => setOpen((v) => !v)} className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-zinc-800">{open ? "Close" : "Customize questions"}</button>
      {open && (
        <div className="mt-3">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Edit the questions JSON below to customize your form. Keep unique <code>key</code> values.</p>
          <Textarea value={draft} onChange={(e: any) => setDraft(e.target.value)} className="font-mono min-h-[260px]" />
          <div className="flex items-center gap-3 mt-2">
            <button onClick={save} className="rounded-xl bg-indigo-600 text-white px-3 py-2">Save</button>
            <button onClick={() => setDraft(JSON.stringify(DEFAULT_QUESTIONS, null, 2))} className="rounded-xl border px-3 py-2">Reset to defaults</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------- Main App -----------------------------
export default function App() {
  const [questions] = useState<string[]>([]);
;

  const [entries, setEntries] = useState<any[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  });

  const [form, setForm] = useState<any>(() => {
    const today = new Date();
    const iso = today.toISOString().slice(0, 10);
    return questions.reduce((acc: any, q: any) => {
      acc[q.key] = q.key === "date" ? iso : q.type === "range" ? 5 : "";
      return acc;
    }, {});
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }, [entries]);

  function setValue(key: string, value: any) {
    setForm((f: any) => ({ ...f, [key]: value }));
  }

  function clearForm() {
    const today = new Date().toISOString().slice(0, 10);
    setForm(questions.reduce((acc: any, q: any) => {
      acc[q.key] = q.key === "date" ? today : q.type === "range" ? 5 : "";
      return acc;
    }, {}));
  }

  function saveEntry() {
    const record = { id: uid(), createdAt: new Date().toISOString(), ...form };
    setEntries((prev) => [record, ...prev]);   // local
    sendToSheet(record);                       // Google Sheet
    clearForm();
  }

  function deleteEntry(id: string) {
    if (!confirm("Delete this entry?")) return;
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

    const chartData = useMemo(() => {
    const rows = [...entries].reverse().slice(-30);
    return rows.map((r: any) => ({
      date: r.date || new Date(r.createdAt).toISOString().slice(0, 10),
      Mood: Number(r.mood ?? 0),
      Anxiety: Number(r.anxiety ?? 0),
      Focus: Number(r.focus ?? 0),
      Energy: Number(r.energy ?? 0),
    }));
  }, [entries]);

  const todayIso = new Date().toISOString().slice(0,10);

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-white dark:from-zinc-950 dark:to-zinc-900 text-zinc-900 dark:text-zinc-50">
      <div className="max-w-6xl mx-auto px-4 py-6 md:py-10">
        <header className="mb-6 md:mb-8 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Microdosing Journal</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Private, on-device log of your microdosing journey. <span className="italic">This is not medical advice.</span>
            </p>
          </div>
                 </header>

        {/* Quick badges */}
        <div className="flex flex-wrap gap-2 mb-6">
          <Badge>Today: {todayIso}</Badge>
          <Badge>Total entries: {entries.length}</Badge>
          <Badge>Local storage</Badge>
        </div>

        {/* Form */}
        <Section title="New Entry" right={<Badge>Guided check-in</Badge>}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {questions.map((q: any) => (
              <QuestionField key={q.key} q={q} value={form[q.key]} onChange={(v: any) => setValue(q.key, v)} />
            ))}
          </div>
          <div className="flex items-center gap-3 mt-4">
            <button onClick={saveEntry} className="rounded-xl bg-indigo-600 text-white px-4 py-2">Save entry</button>
            <button onClick={clearForm} className="rounded-xl border px-4 py-2">Clear</button>
          </div>
          <p className="text-xs text-gray-500 mt-3">Tip: You can customize or add questions (e.g., PHQ-2/9 items, mindfulness minutes, therapy sessions) using the button above.</p>
        </Section>

        {/* Trends */}
        <Section title="Trends (last 30 entries)" right={<Badge>Visualization</Badge>}>
          {chartData.length ? (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" fontSize={12} tickMargin={8} />
                  <YAxis domain={[0, 10]} allowDecimals={false} fontSize={12} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="Mood" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="Anxiety" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="Focus" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="Energy" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-gray-600 dark:text-gray-400">No data yet. Add entries to see your trends.</p>
          )}
        </Section>

        {/* Log */}
        <Section title="Entries" right={<Badge>History</Badge>}>
          {entries.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">Nothing here yet. Your saved entries will appear below.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-gray-200/60 dark:border-zinc-700">
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Protocol</th>
                    <th className="py-2 pr-4">Day</th>
                    <th className="py-2 pr-4">Dose (mg)</th>
                    <th className="py-2 pr-4">Mood</th>
                    <th className="py-2 pr-4">Anxiety</th>
                    <th className="py-2 pr-4">Focus</th>
                    <th className="py-2 pr-4">Energy</th>
                    <th className="py-2 pr-4">Notes</th>
                    <th className="py-2 pr-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e: any) => (
                    <tr key={e.id} className="border-b border-gray-200/50 dark:border-zinc-700">
                      <td className="py-2 pr-4 whitespace-nowrap">{e.date || e.createdAt?.slice(0,10)}</td>
                      <td className="py-2 pr-4">{e.protocol}</td>
                      <td className="py-2 pr-4">{e.dayType}</td>
                      <td className="py-2 pr-4">{e.doseMg}</td>
                      <td className="py-2 pr-4">{e.mood}</td>
                      <td className="py-2 pr-4">{e.anxiety}</td>
                      <td className="py-2 pr-4">{e.focus}</td>
                      <td className="py-2 pr-4">{e.energy}</td>
                      <td className="py-2 pr-4 max-w-[320px] truncate" title={e.notes}>{e.notes}</td>
                      <td className="py-2 pr-4 text-right">
                        <button onClick={() => deleteEntry(e.id)} className="rounded-lg border px-2 py-1 text-xs hover:bg-gray-50 dark:hover:bg-zinc-800">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-gray-500 mt-3">Privacy: Entries are stored locally in your browser. Consider regular exports for backups.</p>
        </Section>

        {/* Footer */}
        <div className="text-xs text-gray-500">
          <p>
            Disclaimer: This app is for personal tracking only and does not provide medical advice. Always follow professional guidance and your local laws.
          </p>
        </div>
      </div>
    </div>
  );
}
