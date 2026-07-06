"use client";

import { useCallback, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/Toast";
import { useQuery, queryClient } from "@/lib/query";
import {
  equipmentApi,
  authApi,
  type EquipmentCatalogItem,
  type EquipmentCatalogSlot,
  type MemberEquipmentData,
} from "@/lib/api";
import {
  matchEquipmentPanel,
  matchEquipmentLayout,
  matchEquipmentClip,
  matchEquipmentAuto,
  matchEquipmentByImage,
  type SlotDebug,
} from "@/lib/equipment-match";
import { scanCombatPower } from "@/lib/combat-power";
import { loadDataUrl, type IconSignature } from "@/lib/image-hash";
import { EQUIPMENT_SLOTS, type EquipmentSlot } from "@guild/shared";
import Button from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import DashboardDecor from "@/components/dashboard/DashboardDecor";
import { ModuleHeader, Magnetic } from "@/components/dashboard/DashboardHelpers";
import UploadDropzone from "./components/UploadDropzone";
import CropSelector from "./components/CropSelector";
import ScanProgress from "./components/ScanProgress";
import EquipmentGrid, { type SlotView } from "./components/EquipmentGrid";
import CorrectionPicker from "./components/CorrectionPicker";
import ScanDebugOverlay from "./components/ScanDebugOverlay";
import ErrorState from "./components/ErrorState";

type Phase = "idle" | "cropping" | "scanning" | "review" | "saving" | "error";

interface Detection {
  item: EquipmentCatalogItem | null;
  confidence: number;
  needsReview: boolean;
  cropSig?: IconSignature | null;
  cropEmbed?: Float32Array | null;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read the image file"));
    reader.readAsDataURL(file);
  });
}

export default function EquipmentPage() {
  const { user, refreshUser } = useAuth();
  const { addToast } = useToast();
  const activeGuild = user?.guilds?.[0];

  const [phase, setPhase] = useState<Phase>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [detections, setDetections] = useState<Record<string, Detection>>({});
  const [pickerSlot, setPickerSlot] = useState<EquipmentSlot | null>(null);
  // Combat Power is read from the SAME screenshot in one scan; editable in review.
  const [cp, setCp] = useState("");
  const [cpDetected, setCpDetected] = useState(false);
  // Scan debug (per-slot boxes + top-3 candidates) for the on-image overlay.
  const [debug, setDebug] = useState<SlotDebug[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const [previewDims, setPreviewDims] = useState<{ w: number; h: number } | null>(null);

  // ─── Catalog (shared, cached aggressively) ──────────────
  const { data: catalog, isLoading: catalogLoading } = useQuery<EquipmentCatalogSlot[]>(
    "equipment:catalog",
    async () => {
      const res = await equipmentApi.getCatalog();
      return res.success && res.data ? res.data.slots : [];
    },
    { persist: true, staleTime: 1000 * 60 * 30 },
  );

  const catalogBySlot = useMemo(() => {
    const map = new Map<string, EquipmentCatalogSlot>();
    for (const s of catalog ?? []) map.set(s.slotType, s);
    return map;
  }, [catalog]);

  // ─── Saved equipment ────────────────────────────────────
  const { data: mine } = useQuery<MemberEquipmentData[]>(
    activeGuild ? `equipment:mine:${activeGuild.guildId}` : "equipment:mine:none",
    async () => {
      if (!activeGuild) return [];
      const res = await equipmentApi.getMine(activeGuild.guildId);
      return res.success && res.data ? res.data.equipment : [];
    },
    { persist: true, staleTime: 1000 * 30, enabled: !!activeGuild },
  );

  const savedViews = useMemo<Record<string, SlotView>>(() => {
    const v: Record<string, SlotView> = {};
    for (const row of mine ?? []) {
      v[row.slotType] = {
        itemName: row.itemName,
        iconUrl: row.iconSignedUrl,
        rarity: row.rarity,
        confidence: row.confidence,
        needsReview: row.needsReview,
      };
    }
    return v;
  }, [mine]);

  const reviewViews = useMemo<Record<string, SlotView>>(() => {
    const v: Record<string, SlotView> = {};
    for (const slot of EQUIPMENT_SLOTS) {
      const d = detections[slot];
      v[slot] = {
        itemName: d?.item?.itemName ?? null,
        iconUrl: d?.item?.iconUrl ?? null,
        rarity: d?.item?.rarity ?? null,
        confidence: d?.item ? d.confidence : null,
        needsReview: d?.needsReview ?? false,
      };
    }
    return v;
  }, [detections]);

  // ─── Scan flow ──────────────────────────────────────────
  // Step 1: load the file and let the user crop to the panel (accuracy on cluttered
  // screenshots depends on isolating the equipment grid from the background).
  const handleFile = useCallback(
    async (file: File) => {
      if (!catalog || catalog.length === 0) {
        addToast("error", "Icon catalog is still loading — try again in a moment.");
        return;
      }
      setError(null);
      setProgress(0);
      setCp("");
      setCpDetected(false);
      setDebug([]);
      setShowDebug(false);
      try {
        const dataUrl = await readAsDataUrl(file);
        setPreviewUrl(dataUrl);
        setPhase("cropping");
      } catch {
        addToast("error", "Could not read the image file.");
      }
    },
    [catalog, addToast],
  );

  // Step 2: run the scan on the chosen region (cropped selection or the whole image).
  const runScan = useCallback(
    async (dataUrl: string) => {
      if (!catalog || catalog.length === 0) return;
      setError(null);
      setProgress(0);
      setCp("");
      setCpDetected(false);
      setDebug([]);
      setShowDebug(false);
      setPreviewUrl(dataUrl);
      setPhase("scanning");
      try {
        const image = await loadDataUrl(dataUrl);
        setPreviewDims({ w: image.naturalWidth, h: image.naturalHeight });

        // Equipment matching: layout-aware per-slot (assign each tile to a slot by
        // geometry, match only against that slot's bucket with a tight crop). Falls back
        // to the fixed-layout matcher, then whole-catalog CLIP, then the dHash detectors.
        let scanDebug: SlotDebug[] = [];
        const matchGear = async (): Promise<
          Record<string, { item: EquipmentCatalogItem | null; confidence: number; needsReview: boolean; cropSig?: IconSignature | null; cropEmbed?: Float32Array | null }>
        > => {
          try {
            const panel = await matchEquipmentPanel(image, catalog, setProgress);
            scanDebug = panel.debug;
            if (panel.located >= 8) return panel.result;
            const clip = await matchEquipmentClip(image, catalog, setProgress);
            return clip.regions >= 4 ? clip.result : await matchEquipmentLayout(image, catalog, setProgress);
          } catch (e) {
            console.warn("[equipment] panel scan failed, using CLIP/dHash fallback", e);
            try {
              const auto = await matchEquipmentAuto(image, catalog, setProgress);
              return auto.regions >= 4 ? auto.result : await matchEquipmentByImage(image, catalog, setProgress);
            } catch (e2) {
              console.warn("[equipment] auto detect failed, using layout fallback", e2);
              return matchEquipmentByImage(image, catalog, setProgress);
            }
          }
        };

        // ONE scan → both gear icons AND Combat Power from the same screenshot.
        const [matched, cpResult] = await Promise.all([
          matchGear(),
          scanCombatPower(dataUrl).catch(() => ({ cp: null, raw: "" })),
        ]);

        const next: Record<string, Detection> = {};
        for (const slot of EQUIPMENT_SLOTS) {
          const m = matched[slot];
          next[slot] = {
            item: m?.item ?? null,
            confidence: m?.confidence ?? 0,
            needsReview: m?.needsReview ?? false,
            cropSig: m?.cropSig ?? null,
            cropEmbed: m?.cropEmbed ?? null,
          };
        }
        setDetections(next);
        setDebug(scanDebug);
        if (cpResult.cp != null) {
          setCp(cpResult.cp.toLocaleString());
          setCpDetected(true);
        }
        setPhase("review");
      } catch (err) {
        console.error("[equipment] scan failed", err);
        setError(err instanceof Error ? err.message : "The screenshot could not be processed.");
        setPhase("error");
      }
    },
    [catalog],
  );

  const reset = useCallback(() => {
    setPhase("idle");
    setPreviewUrl(null);
    setDetections({});
    setError(null);
    setProgress(0);
    setCp("");
    setCpDetected(false);
    setDebug([]);
    setShowDebug(false);
    setPreviewDims(null);
  }, []);

  // ─── Corrections ────────────────────────────────────────
  const pickItem = (item: EquipmentCatalogItem) => {
    if (!pickerSlot) return;
    setDetections((prev) => ({
      ...prev,
      [pickerSlot]: { item, confidence: 1, needsReview: false },
    }));
    setPickerSlot(null);
  };

  const clearSlot = () => {
    if (!pickerSlot) return;
    setDetections((prev) => ({
      ...prev,
      [pickerSlot]: { item: null, confidence: 0, needsReview: false },
    }));
    setPickerSlot(null);
  };

  // ─── Save ───────────────────────────────────────────────
  const matchedCount = useMemo(
    () => Object.values(detections).filter((d) => d.item).length,
    [detections],
  );
  const reviewCount = useMemo(
    () => Object.values(detections).filter((d) => d.needsReview).length,
    [detections],
  );

  const cpNumber = useMemo(() => (cp ? Number(cp.replace(/[^\d]/g, "")) : 0), [cp]);

  const handleConfirm = async () => {
    if (!activeGuild) return;
    const items = (EQUIPMENT_SLOTS as readonly EquipmentSlot[])
      .map((slot) => ({ slot, d: detections[slot] }))
      .filter((x) => x.d?.item)
      .map(({ slot, d }) => ({
        slotType: slot,
        itemName: d!.item!.itemName,
        iconPath: d!.item!.path,
        iconBucket: d!.item!.bucket,
        rarity: d!.item!.rarity ?? undefined,
        confidence: d!.confidence,
      }));

    const hasCp = cpNumber > 0;
    if (items.length === 0 && !hasCp) {
      addToast("error", "Nothing to save — detect gear or a Combat Power value first.");
      return;
    }

    setPhase("saving");
    try {
      // Save equipment (only if any items were detected/selected).
      if (items.length > 0) {
        // Screenshot persistence is best-effort — never blocks the save.
        let sourceScreenshotPath: string | undefined;
        if (previewUrl?.startsWith("data:")) {
          try {
            const up = await equipmentApi.uploadScreenshot(activeGuild.guildId, previewUrl);
            if (up.success && up.data?.path) sourceScreenshotPath = up.data.path;
          } catch {
            /* ignore — screenshot is optional */
          }
        }

        const res = await equipmentApi.confirm(activeGuild.guildId, { items, sourceScreenshotPath });
        if (!res.success) {
          setPhase("review");
          addToast("error", res.error?.message || "Failed to save equipment.");
          return;
        }
        queryClient.invalidateQueries(`equipment:mine:${activeGuild.guildId}`);
      }

      // Save Combat Power (syncs profile + all guild memberships).
      let cpSaved = false;
      if (hasCp) {
        const cpRes = await authApi.updateCp(cpNumber);
        if (cpRes.success) {
          cpSaved = true;
          await refreshUser();
        }
      }

      const parts: string[] = [];
      if (items.length > 0) parts.push(`${items.length} item${items.length > 1 ? "s" : ""}`);
      if (cpSaved) parts.push(`Combat Power ${cpNumber.toLocaleString()}`);
      addToast("success", `Saved ${parts.join(" and ")} to your profile.`);
      reset();
    } catch (err) {
      setPhase("review");
      addToast("error", err instanceof Error ? err.message : "Failed to save.");
    }
  };

  if (!user || !activeGuild) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-white/40">No active guild selected</p>
      </div>
    );
  }

  const hasSaved = (mine?.length ?? 0) > 0;
  const currentCp = user?.cp ?? null;

  const saveLabel = (() => {
    const hasItems = matchedCount > 0;
    const hasCp = cpNumber > 0;
    if (hasItems && hasCp) return "Save gear + CP";
    if (hasItems) return `Save ${matchedCount} item${matchedCount === 1 ? "" : "s"}`;
    if (hasCp) return "Save Combat Power";
    return "Save";
  })();

  return (
    <div className="relative mx-auto w-full max-w-7xl px-2 pb-12 md:px-4">
      <DashboardDecor />

      <div className="relative z-10 space-y-6 text-white/85">
        <ModuleHeader
          eyebrow="My Gear"
          title="Gear & Combat Power Scanner"
          description="Upload one screenshot — your gear icons are matched against the guild library and your Combat Power is read automatically. Review, correct, and save to your profile."
          right={
            phase === "review" ? (
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={reset}>
                  Cancel
                </Button>
                <Magnetic strength={4}>
                  <Button variant="primary" size="sm" onClick={handleConfirm}>
                    {saveLabel}
                  </Button>
                </Magnetic>
              </div>
            ) : phase === "idle" && hasSaved ? (
              <Magnetic strength={4}>
                <Button variant="secondary" size="sm" onClick={() => document.getElementById("eq-rescan")?.scrollIntoView({ behavior: "smooth" })}>
                  Update with new screenshot
                </Button>
              </Magnetic>
            ) : undefined
          }
        />

        {phase === "saving" && (
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-sm text-white/60">
            Saving your equipment…
          </div>
        )}

        {/* CROP */}
        {phase === "cropping" && previewUrl && (
          <CropSelector imageUrl={previewUrl} onScan={runScan} onCancel={reset} />
        )}

        {/* SCANNING */}
        {phase === "scanning" && <ScanProgress progress={progress} previewUrl={previewUrl} />}

        {/* ERROR */}
        {phase === "error" && <ErrorState message={error || "Something went wrong."} onRetry={reset} />}

        {/* REVIEW */}
        {(phase === "review" || phase === "saving") && (
          <div className="space-y-4">
            {/* Combat Power (read from the same screenshot; editable) */}
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
              <div className="flex items-center gap-2">
                <svg className="h-5 w-5 text-[var(--forge-gold)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 2 7 12 12 22 7 12 2" />
                  <polyline points="2 17 12 22 22 17" />
                  <polyline points="2 12 12 17 22 12" />
                </svg>
                <span className="text-sm font-semibold text-white">Combat Power</span>
              </div>
              <input
                value={cp}
                onChange={(e) => {
                  const clean = e.target.value.replace(/[^0-9]/g, "");
                  setCp(clean ? Number(clean).toLocaleString() : "");
                  setCpDetected(false);
                }}
                placeholder="e.g. 51,952"
                inputMode="numeric"
                disabled={phase === "saving"}
                className="w-36 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-sm text-white focus:border-white/25 focus:outline-none"
              />
              <span className="text-xs">
                {cpDetected ? (
                  <span className="text-emerald-300">detected from screenshot</span>
                ) : cpNumber > 0 ? (
                  <span className="text-white/40">manual entry</span>
                ) : (
                  <span className="text-white/40">not detected — enter manually if you want to update it</span>
                )}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
              <span className="text-sm font-semibold text-white">Confirm detected equipment</span>
              <span className="text-xs text-emerald-300">{matchedCount} matched</span>
              {reviewCount > 0 && (
                <span className="text-xs text-amber-300">{reviewCount} need review</span>
              )}
              {debug.length > 0 && (
                <button
                  onClick={() => setShowDebug(true)}
                  className="rounded-md border border-white/[0.12] px-2 py-0.5 text-[11px] text-white/60 hover:border-white/30 hover:text-white/90"
                >
                  Debug scan
                </button>
              )}
              <span className="ml-auto text-xs text-white/40">Tap any slot to correct it</span>
            </div>
            <EquipmentGrid
              views={reviewViews}
              previewUrl={previewUrl}
              onSlotClick={(slot) => setPickerSlot(slot)}
            />
          </div>
        )}

        {/* IDLE */}
        {phase === "idle" && (
          <div className="space-y-6">
            {catalogLoading && !catalog ? (
              <Skeleton className="h-64 w-full animate-pulse rounded-2xl" />
            ) : (
              <>
                {hasSaved && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-semibold text-white/80">Your saved equipment</h2>
                      {currentCp != null && (
                        <span className="flex items-center gap-1.5 text-xs text-white/50">
                          <svg className="h-3.5 w-3.5 text-[var(--forge-gold)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                            <polygon points="12 2 2 7 12 12 22 7 12 2" />
                            <polyline points="2 17 12 22 22 17" />
                            <polyline points="2 12 12 17 22 12" />
                          </svg>
                          Combat Power{" "}
                          <span className="font-mono text-[var(--forge-gold-bright)]">
                            {currentCp.toLocaleString()}
                          </span>
                        </span>
                      )}
                    </div>
                    <EquipmentGrid views={savedViews} previewUrl={null} readOnly />
                  </div>
                )}
                <div id="eq-rescan" className="space-y-2">
                  {hasSaved && (
                    <h2 className="text-sm font-semibold text-white/80">Scan a new screenshot</h2>
                  )}
                  <UploadDropzone onFile={handleFile} />
                  <p className="text-[11px] text-white/35">
                    One scan reads both your equipped gear and your Combat Power from the same image.
                  </p>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Correction picker */}
      {pickerSlot && catalogBySlot.get(pickerSlot) && (
        <CorrectionPicker
          slot={catalogBySlot.get(pickerSlot)!}
          currentPath={detections[pickerSlot]?.item?.path ?? null}
          cropSig={detections[pickerSlot]?.cropSig ?? null}
          cropEmbed={detections[pickerSlot]?.cropEmbed ?? null}
          onSelect={pickItem}
          onClear={clearSlot}
          onClose={() => setPickerSlot(null)}
        />
      )}

      {/* Scan debug overlay */}
      {showDebug && previewUrl && previewDims && (
        <ScanDebugOverlay
          previewUrl={previewUrl}
          dims={previewDims}
          debug={debug}
          onClose={() => setShowDebug(false)}
        />
      )}
    </div>
  );
}
