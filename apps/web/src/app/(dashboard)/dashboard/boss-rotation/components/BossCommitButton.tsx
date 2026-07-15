"use client";

import { useEffect, useRef, useState } from "react";
import { dashboardApi, type BossCommitmentData } from "@/lib/api";
import { useQuery, queryClient } from "@/lib/query";
import { useSocket } from "@/components/providers/socket-provider";
import { useToast } from "@/components/ui/Toast";

interface Props {
  guildId: string;
  scheduleId: string;
  /** Pre-fetched slice from the page-level batch commitments call (see
   *  boss-rotation/page.tsx). When present at mount time, the first read
   *  is seeded from this instead of firing this card's own network request —
   *  every visible card doing its own `getBossCommitments` call otherwise
   *  adds up to one request per card. Only helps on mount; live updates
   *  still go through the socket-driven invalidation below. */
  initialData?: BossCommitmentData;
}

/** War-planning headcount for a specific boss spawn. Any member can toggle
 *  "I can commit"; everyone sees the live count and can expand the roster. */
export default function BossCommitButton({ guildId, scheduleId, initialData }: Props) {
  const { addToast } = useToast();
  const { socket } = useSocket();
  const [expanded, setExpanded] = useState(false);
  const [isToggling, setIsToggling] = useState(false);

  // Consumed once — after the first fetch, subsequent invalidations (toggle,
  // socket event) should always hit the network for a real up-to-date read.
  const seedRef = useRef(initialData);

  const key = `boss_commitments:${scheduleId}`;
  const { data } = useQuery(
    key,
    async () => {
      if (seedRef.current) {
        const seeded = seedRef.current;
        seedRef.current = undefined;
        return seeded;
      }
      const res = await dashboardApi.getBossCommitments(guildId, scheduleId);
      return res.success && res.data ? res.data : { count: 0, committed: false, members: [] };
    },
    { staleTime: 20000 },
  );

  useEffect(() => {
    if (!socket) return;
    const handler = (payload: { scheduleId: string }) => {
      if (payload.scheduleId === scheduleId) queryClient.invalidateQueries(key);
    };
    socket.on("boss_commitment_updated", handler);
    return () => {
      socket.off("boss_commitment_updated", handler);
    };
  }, [socket, scheduleId, key]);

  const count = data?.count ?? 0;
  const committed = data?.committed ?? false;
  const members = data?.members ?? [];

  async function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    setIsToggling(true);
    try {
      const res = await dashboardApi.setBossCommitment(guildId, scheduleId, !committed);
      if (res.success) {
        queryClient.invalidateQueries(key);
      } else {
        addToast("error", res.error?.message || "Failed to update commitment");
      }
    } catch (err: any) {
      addToast("error", err?.message || "An error occurred");
    } finally {
      setIsToggling(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.01] p-2.5">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={toggle}
          disabled={isToggling}
          className={`inline-flex items-center gap-1.5 h-7 px-3 rounded-full border text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50 ${
            committed
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
              : "border-white/10 bg-white/[0.02] text-white/50 hover:text-white/85 hover:border-white/25"
          }`}
        >
          <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            {committed ? <polyline points="20 6 9 17 4 12" /> : <path d="M12 5v14M5 12h14" />}
          </svg>
          {committed ? "Committed" : "Can commit"}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          className="inline-flex items-center gap-1 text-[10px] font-mono text-white/45 hover:text-white/80 cursor-pointer transition-colors"
        >
          <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
          </svg>
          {count} {expanded ? "▲" : "▼"}
        </button>
      </div>
      {expanded && (
        <div className="mt-2 pt-2 border-t border-white/[0.05] max-h-[120px] overflow-y-auto space-y-1">
          {members.length === 0 ? (
            <p className="text-[10px] text-white/30 italic">No one has committed yet.</p>
          ) : (
            members.map((m) => (
              <div key={m.id} className="flex items-center justify-between text-[11px] text-white/70">
                <span className="truncate">{m.ign || "Member"}</span>
                {m.rankName && <span className="text-white/30 text-[10px] shrink-0 ml-2">{m.rankName}</span>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
