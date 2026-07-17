"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { dashboardApi, type BossCommitmentData } from "@/lib/api";
import { useQuery, queryClient } from "@/lib/query";
import { useSocket } from "@/components/providers/socket-provider";
import { useToast } from "@/components/ui/Toast";

interface Props {
  guildId: string;
  scheduleId: string;
  /** Shown as the roster modal's title, e.g. "Venatus — Can Commit". */
  bossName?: string;
  /** Pre-fetched slice from the page-level batch commitments call (see
   *  boss-rotation/page.tsx). When present at mount time, the first read
   *  is seeded from this instead of firing this card's own network request —
   *  every visible card doing its own `getBossCommitments` call otherwise
   *  adds up to one request per card. Only helps on mount; live updates
   *  still go through the socket-driven invalidation below. */
  initialData?: BossCommitmentData;
  /** "card" (default) renders its own bordered box, stacked below the queue.
   *  "inline" drops the box and lets the parent place the trigger directly
   *  in its own row (e.g. beside the "Taken" button). */
  variant?: "card" | "inline";
}

/** War-planning headcount for a specific boss spawn. The card/row only shows
 *  a single trigger (status + count) — the actual "I can commit" toggle
 *  lives inside the roster modal, which has room to make it a real button
 *  instead of squeezing a second pill next to it. A guild can easily have
 *  30-50+ members, so the full roster gets its own scrollable dialog rather
 *  than an inline expanding list. The modal is portaled to `document.body`
 *  since a `position: fixed` element inside a card that animates `transform`
 *  (the fadeInUp entrance) gets contained by that ancestor instead of the
 *  viewport — without the portal the dialog renders clipped to the card. */
export default function BossCommitButton({ guildId, scheduleId, bossName, initialData, variant = "card" }: Props) {
  const { addToast } = useToast();
  const { socket } = useSocket();
  const [showRoster, setShowRoster] = useState(false);
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

  // Single outside trigger — opens the roster modal, where the (bigger)
  // commit toggle lives. Keeping a second toggle out here duplicated the
  // modal's own pill for no benefit and just crowded the card/footer row.
  const trigger = (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setShowRoster(true);
      }}
      className={`inline-flex items-center gap-1.5 h-7 px-3 rounded-full border text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
        committed
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
          : "border-white/10 bg-white/[0.02] text-white/50 hover:text-white/85 hover:border-white/25"
      }`}
    >
      <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
      </svg>
      {committed ? "Committed" : "Can commit"}
      <span className={`font-mono ${committed ? "text-emerald-400/70" : "text-white/35"}`}>({count})</span>
    </button>
  );

  return (
    <>
      {variant === "inline" ? (
        trigger
      ) : (
        <div className="rounded-xl border border-white/[0.05] bg-white/[0.01] p-2.5">{trigger}</div>
      )}

      {showRoster &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={(e) => {
              e.stopPropagation();
              setShowRoster(false);
            }}
          >
            <div className="absolute inset-0 bg-black/75 backdrop-blur-md" />
            <div
              className="relative w-full max-w-lg glass-strong rounded-2xl border border-white/[0.08] shadow-2xl overflow-hidden z-50 animate-scale-in max-h-[85vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-5 border-b border-white/[0.06] flex items-center justify-between gap-3 shrink-0">
                <div className="min-w-0">
                  <p className="text-[11px] text-white/40 uppercase tracking-wider">Can Commit</p>
                  <h3 className="text-lg font-bold text-white truncate">{bossName || "Roster"}</h3>
                </div>
                <button
                  onClick={() => setShowRoster(false)}
                  className="text-white/40 hover:text-white/80 cursor-pointer shrink-0"
                  aria-label="Close"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="px-5 py-4 border-b border-white/[0.06] shrink-0">
                <button
                  type="button"
                  onClick={toggle}
                  disabled={isToggling}
                  className={`w-full inline-flex items-center justify-center gap-1.5 h-11 px-3 rounded-full border text-[12px] font-bold uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50 ${
                    committed
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                      : "border-white/10 bg-white/[0.02] text-white/50 hover:text-white/85 hover:border-white/25"
                  }`}
                >
                  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    {committed ? <polyline points="20 6 9 17 4 12" /> : <path d="M12 5v14M5 12h14" />}
                  </svg>
                  {committed ? "You're committed" : "Can commit"}
                </button>
              </div>

              <div className="p-3 overflow-y-auto space-y-0.5">
                {members.length === 0 ? (
                  <p className="text-[12px] text-white/30 italic text-center py-8">No one has committed yet.</p>
                ) : (
                  members.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg hover:bg-white/[0.03] text-[13px] text-white/75"
                    >
                      <span className="truncate">{m.ign || "Member"}</span>
                      {m.rankName && <span className="text-white/35 text-[11px] shrink-0">{m.rankName}</span>}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
