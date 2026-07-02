"use client";

import { useCallback, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/Toast";
import { useQuery, queryClient } from "@/lib/query";
import {
  equipmentApi,
  type EquipmentCatalogItem,
  type EquipmentCatalogSlot,
  type MemberEquipmentData,
} from "@/lib/api";
import { matchEquipmentAuto, matchEquipmentByImage } from "@/lib/equipment-match";
import { loadDataUrl, type IconSignature } from "@/lib/image-hash";
import { EQUIPMENT_SLOTS, type EquipmentSlot } from "@guild/shared";
import Button from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import DashboardDecor from "@/components/dashboard/DashboardDecor";
import { ModuleHeader, Magnetic } from "@/components/dashboard/DashboardHelpers";
import UploadDropzone from "./components/UploadDropzone";
import ScanProgress from "./components/ScanProgress";
import EquipmentGrid, { type SlotView } from "./components/EquipmentGrid";
import CorrectionPicker from "./components/CorrectionPicker";
import ErrorState from "./components/ErrorState";

type Phase = "idle" | "scanning" | "review" | "saving" | "error";

interface Detection {
  item: EquipmentCatalogItem | null;
  confidence: number;
  needsReview: boolean;
  cropSig?: IconSignature | null;
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
  const { user } = useAuth();
  const { addToast } = useToast();
  const activeGuild = user?.guilds?.[0];

  const [phase, setPhase] = useState<Phase>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [detections, setDetections] = useState<Record<string, Detection>>({});
  const [pickerSlot, setPickerSlot] = useState<EquipmentSlot | null>(null);

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
  const handleFile = useCallback(
    async (file: File) => {
      if (!catalog || catalog.length === 0) {
        addToast("error", "Icon catalog is still loading — try again in a moment.");
        return;
      }
      setError(null);
      setProgress(0);
      setPhase("scanning");
      try {
        const dataUrl = await readAsDataUrl(file);
        setPreviewUrl(dataUrl);
        const image = await loadDataUrl(dataUrl);
        // Automatic OpenCV detection; fall back to the fixed-layout matcher if
        // OpenCV finds too few tiles or fails to load.
        let matched: Record<string, { item: EquipmentCatalogItem | null; confidence: number; needsReview: boolean; cropSig?: IconSignature | null }>;
        try {
          const auto = await matchEquipmentAuto(image, catalog, setProgress);
          matched =
            auto.regions >= 4 ? auto.result : await matchEquipmentByImage(image, catalog, setProgress);
        } catch (e) {
          console.warn("[equipment] auto detect failed, using layout fallback", e);
          matched = await matchEquipmentByImage(image, catalog, setProgress);
        }
        const next: Record<string, Detection> = {};
        for (const slot of EQUIPMENT_SLOTS) {
          const m = matched[slot];
          next[slot] = {
            item: m?.item ?? null,
            confidence: m?.confidence ?? 0,
            needsReview: m?.needsReview ?? false,
            cropSig: m?.cropSig ?? null,
          };
        }
        setDetections(next);
        setPhase("review");
      } catch (err) {
        console.error("[equipment] scan failed", err);
        setError(err instanceof Error ? err.message : "The screenshot could not be processed.");
        setPhase("error");
      }
    },
    [catalog, addToast],
  );

  const reset = useCallback(() => {
    setPhase("idle");
    setPreviewUrl(null);
    setDetections({});
    setError(null);
    setProgress(0);
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

    if (items.length === 0) {
      addToast("error", "Select at least one item before saving.");
      return;
    }

    setPhase("saving");
    try {
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
      if (res.success) {
        addToast("success", `Saved ${items.length} equipped item${items.length > 1 ? "s" : ""} to your profile.`);
        queryClient.invalidateQueries(`equipment:mine:${activeGuild.guildId}`);
        reset();
      } else {
        setPhase("review");
        addToast("error", res.error?.message || "Failed to save equipment.");
      }
    } catch (err) {
      setPhase("review");
      addToast("error", err instanceof Error ? err.message : "Failed to save equipment.");
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

  return (
    <div className="relative mx-auto w-full max-w-7xl px-2 pb-12 md:px-4">
      <DashboardDecor />

      <div className="relative z-10 space-y-6 text-white/85">
        <ModuleHeader
          eyebrow="My Gear"
          title="Equipment Scanner"
          description="Upload your in-game Equipment panel — each slot's icon is matched against the guild icon library. Review, correct, and save to your profile."
          right={
            phase === "review" ? (
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={reset}>
                  Cancel
                </Button>
                <Magnetic strength={4}>
                  <Button variant="primary" size="sm" onClick={handleConfirm}>
                    Save {matchedCount} item{matchedCount === 1 ? "" : "s"}
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

        {/* SCANNING */}
        {phase === "scanning" && <ScanProgress progress={progress} previewUrl={previewUrl} />}

        {/* ERROR */}
        {phase === "error" && <ErrorState message={error || "Something went wrong."} onRetry={reset} />}

        {/* REVIEW */}
        {(phase === "review" || phase === "saving") && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
              <span className="text-sm font-semibold text-white">Confirm detected equipment</span>
              <span className="text-xs text-emerald-300">{matchedCount} matched</span>
              {reviewCount > 0 && (
                <span className="text-xs text-amber-300">{reviewCount} need review</span>
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
                    <h2 className="text-sm font-semibold text-white/80">Your saved equipment</h2>
                    <EquipmentGrid views={savedViews} previewUrl={null} readOnly />
                  </div>
                )}
                <div id="eq-rescan" className="space-y-2">
                  {hasSaved && (
                    <h2 className="text-sm font-semibold text-white/80">Scan a new screenshot</h2>
                  )}
                  <UploadDropzone onFile={handleFile} />
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
          onSelect={pickItem}
          onClear={clearSlot}
          onClose={() => setPickerSlot(null)}
        />
      )}
    </div>
  );
}
