"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import type { ActivityInput, ActivityType, ActivityStatus, ActivityResult, GuildActivityData } from "@/lib/api";

const TYPES: Array<{ id: ActivityType; label: string }> = [
  { id: "GUILD_BOSS", label: "Guild Boss" },
  { id: "GUILD_WAR", label: "Guild War" },
  { id: "PK_WAR", label: "PK War" },
];

function toLocalParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

export default function ActivityModal({
  open,
  onClose,
  editing,
  saving,
  onSubmit,
  defaultType = "GUILD_WAR",
}: {
  open: boolean;
  onClose: () => void;
  editing: GuildActivityData | null;
  saving: boolean;
  onSubmit: (payload: ActivityInput) => void;
  defaultType?: ActivityType;
}) {
  const [type, setType] = useState<ActivityType>(defaultType);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [opponent, setOpponent] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<ActivityStatus>("UPCOMING");
  const [result, setResult] = useState<ActivityResult | "">("");
  const [scoreFor, setScoreFor] = useState("");
  const [scoreAgainst, setScoreAgainst] = useState("");

  useEffect(() => {
    if (!open) return;
    if (editing) {
      const { date: d, time: t } = toLocalParts(editing.scheduledAt);
      setType(editing.type);
      setTitle(editing.title);
      setDate(d);
      setTime(t);
      setLocation(editing.location ?? "");
      setOpponent(editing.opponent ?? "");
      setNotes(editing.notes ?? "");
      setStatus(editing.status);
      setResult(editing.result ?? "");
      setScoreFor(editing.scoreFor != null ? String(editing.scoreFor) : "");
      setScoreAgainst(editing.scoreAgainst != null ? String(editing.scoreAgainst) : "");
    } else {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      setType(defaultType);
      setTitle("");
      setDate(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
      setTime(`${pad(now.getHours())}:${pad(now.getMinutes())}`);
      setLocation("");
      setOpponent("");
      setNotes("");
      setStatus("UPCOMING");
      setResult("");
      setScoreFor("");
      setScoreAgainst("");
    }
  }, [open, editing, defaultType]);

  if (!open) return null;

  const isWar = type === "GUILD_WAR" || type === "PK_WAR";
  const canSubmit = title.trim() && date && time && !saving;

  function submit() {
    if (!canSubmit) return;
    const scheduledAt = new Date(`${date}T${time}`).toISOString();
    const payload: ActivityInput = {
      type,
      title: title.trim(),
      location: location.trim() || null,
      opponent: opponent.trim() || null,
      notes: notes.trim() || null,
      scheduledAt,
    };
    if (editing) {
      payload.status = status;
      payload.result = result || null;
      payload.scoreFor = scoreFor.trim() === "" ? null : Math.max(0, parseInt(scoreFor, 10) || 0);
      payload.scoreAgainst = scoreAgainst.trim() === "" ? null : Math.max(0, parseInt(scoreAgainst, 10) || 0);
    }
    onSubmit(payload);
  }

  const label = "block text-[10px] font-medium text-white/50 uppercase tracking-[0.16em] mb-1.5";
  const field =
    "w-full px-3 py-2 rounded-lg bg-[var(--obsidian-elevated)]/60 border border-[var(--metal-border)] text-[13px] text-white focus:outline-none focus:border-[var(--forge-gold)]/40 placeholder:text-white/30";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={() => !saving && onClose()} />
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-[var(--metal-border)] bg-[var(--obsidian-elevated)] shadow-[0_40px_90px_-25px_rgba(0,0,0,0.8)] p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-white">{editing ? "Edit activity" : "Schedule activity"}</h3>
          <button onClick={() => !saving && onClose()} className="text-white/40 hover:text-white cursor-pointer" aria-label="Close">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Type selector */}
        <div className="mb-4">
          <span className={label}>Activity type</span>
          <div className="grid grid-cols-3 gap-2">
            {TYPES.map((t) => (
              <button
                key={t.id}
                onClick={() => setType(t.id)}
                className={`px-2 py-2 rounded-lg border text-[12px] font-semibold transition-all cursor-pointer ${
                  type === t.id
                    ? "border-[var(--forge-gold)]/45 bg-[var(--forge-glow)] text-[var(--forge-gold-bright)]"
                    : "border-white/[0.08] bg-white/[0.02] text-white/45 hover:text-white/75"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <span className={label}>Title</span>
            <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={isWar ? "e.g. Castle Siege" : "e.g. World Boss run"} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className={label}>Date</span>
              <input type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <span className={label}>Time</span>
              <input type="time" className={field} value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className={label}>Location</span>
              <input className={field} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Optional" />
            </div>
            <div>
              <span className={label}>{isWar ? "Opponent guild" : "Opponent"}</span>
              <input className={field} value={opponent} onChange={(e) => setOpponent(e.target.value)} placeholder={isWar ? "Enemy guild" : "Optional"} />
            </div>
          </div>

          <div>
            <span className={label}>Notes</span>
            <textarea className={`${field} resize-none`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional details" />
          </div>

          {editing && (
            <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3 space-y-3">
              <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-white/40">Outcome</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className={label}>Status</span>
                  <select className={`${field} cursor-pointer`} value={status} onChange={(e) => setStatus(e.target.value as ActivityStatus)}>
                    <option className="bg-[#0c0d12]" value="UPCOMING">Upcoming</option>
                    <option className="bg-[#0c0d12]" value="COMPLETED">Completed</option>
                    <option className="bg-[#0c0d12]" value="CANCELLED">Cancelled</option>
                  </select>
                </div>
                <div>
                  <span className={label}>Result</span>
                  <select className={`${field} cursor-pointer`} value={result} onChange={(e) => setResult(e.target.value as ActivityResult | "")}>
                    <option className="bg-[#0c0d12]" value="">—</option>
                    <option className="bg-[#0c0d12]" value="WIN">Win</option>
                    <option className="bg-[#0c0d12]" value="LOSS">Loss</option>
                    <option className="bg-[#0c0d12]" value="DRAW">Draw</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className={label}>Our score</span>
                  <input type="number" min={0} className={field} value={scoreFor} onChange={(e) => setScoreFor(e.target.value)} placeholder="—" />
                </div>
                <div>
                  <span className={label}>Their score</span>
                  <input type="number" min={0} className={field} value={scoreAgainst} onChange={(e) => setScoreAgainst(e.target.value)} placeholder="—" />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-white/[0.06] pt-4 mt-4">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="accent" size="sm" onClick={submit} isLoading={saving} disabled={!canSubmit}>
            {editing ? "Save changes" : "Schedule"}
          </Button>
        </div>
      </div>
    </div>
  );
}
