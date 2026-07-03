"use client";

import { useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/Toast";
import { authApi } from "@/lib/api";
import { scanCombatPower } from "@/lib/combat-power";
import Button from "@/components/ui/Button";

type Phase = "idle" | "scanning" | "manual" | "saving";

/**
 * Scan a character screenshot → OCR the "Combat Power" value → auto-save it to the
 * profile + every guild membership. Falls back to a manual number entry if OCR can't
 * confidently read the value.
 */
export default function CombatPowerScan() {
  const { user, refreshUser } = useAuth();
  const { addToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [manualCp, setManualCp] = useState("");

  const currentCp = user?.cp ?? null;

  const save = async (cp: number, viaScan: boolean) => {
    setPhase("saving");
    try {
      const res = await authApi.updateCp(cp);
      if (res.success) {
        await refreshUser();
        addToast(
          "success",
          `Combat Power ${viaScan ? "scanned and " : ""}updated to ${cp.toLocaleString()}.`,
        );
        setPhase("idle");
        setManualCp("");
      } else {
        addToast("error", res.error?.message || "Failed to update Combat Power.");
        setPhase("manual");
      }
    } catch (err) {
      addToast("error", err instanceof Error ? err.message : "Failed to update Combat Power.");
      setPhase("manual");
    }
  };

  const handleFile = async (file: File | undefined | null) => {
    if (!file || !file.type.startsWith("image/")) return;
    setPhase("scanning");
    setProgress(0);
    try {
      const { cp } = await scanCombatPower(file, setProgress);
      if (cp != null) {
        await save(cp, true);
      } else {
        addToast("error", "Couldn't read Combat Power from that image — enter it manually.");
        setPhase("manual");
      }
    } catch (err) {
      console.error("[cp-scan] failed", err);
      addToast("error", "The screenshot could not be processed — enter your CP manually.");
      setPhase("manual");
    }
  };

  const submitManual = () => {
    const n = Number(manualCp.replace(/[^\d]/g, ""));
    if (!n || n <= 0) {
      addToast("error", "Enter a valid Combat Power number.");
      return;
    }
    void save(n, false);
  };

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.08] bg-[var(--forge-glow)]">
            <svg className="h-6 w-6 text-[var(--forge-gold)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Combat Power</h3>
            <p className="text-xs text-white/45">
              Current:{" "}
              <span className="font-mono text-[var(--forge-gold-bright)]">
                {currentCp != null ? currentCp.toLocaleString() : "—"}
              </span>
            </p>
          </div>
        </div>

        {(phase === "idle" || phase === "manual") && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => inputRef.current?.click()}
          >
            Scan screenshot
          </Button>
        )}
      </div>

      {/* Scanning progress */}
      {(phase === "scanning" || phase === "saving") && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-white/50">
            <span>{phase === "saving" ? "Saving…" : "Reading Combat Power…"}</span>
            {phase === "scanning" && <span>{Math.round(progress * 100)}%</span>}
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-[var(--forge-gold)] transition-all"
              style={{ width: phase === "saving" ? "100%" : `${Math.max(4, progress * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Manual fallback */}
      {phase === "manual" && (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[180px]">
            <label className="mb-1 block text-xs text-white/50">Enter Combat Power manually</label>
            <input
              autoFocus
              value={manualCp}
              onChange={(e) => {
                const clean = e.target.value.replace(/[^0-9]/g, "");
                setManualCp(clean ? Number(clean).toLocaleString() : "");
              }}
              onKeyDown={(e) => e.key === "Enter" && submitManual()}
              placeholder="e.g. 51,952"
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2 text-sm text-white focus:border-white/25 focus:outline-none"
            />
          </div>
          <Button variant="primary" size="sm" onClick={submitManual}>
            Save CP
          </Button>
        </div>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-white/30">
        Upload a screenshot showing your character&apos;s <span className="text-white/50">Combat Power</span> — it&apos;s
        read automatically and saved to your profile and guild rosters.
      </p>
    </div>
  );
}
