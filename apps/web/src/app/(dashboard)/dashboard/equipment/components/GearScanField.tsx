"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@/lib/query";
import {
  equipmentApi,
  type ConfirmEquipmentItem,
  type EquipmentCatalogItem,
  type EquipmentCatalogSlot,
} from "@/lib/api";
import { matchEquipmentAuto, matchEquipmentByImage } from "@/lib/equipment-match";
import { loadDataUrl, type IconSignature } from "@/lib/image-hash";
import { EQUIPMENT_SLOTS, type EquipmentSlot } from "@guild/shared";
import UploadDropzone from "./UploadDropzone";
import ScanProgress from "./ScanProgress";
import EquipmentGrid, { type SlotView } from "./EquipmentGrid";
import CorrectionPicker from "./CorrectionPicker";
import ErrorState from "./ErrorState";

type Phase = "idle" | "scanning" | "review" | "error";

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

/**
 * Self-contained equipment scanner used during guild onboarding. Reports the
 * confirmed gear (slots with a chosen item) to the parent via `onChange`.
 */
export default function GearScanField({
  onChange,
}: {
  onChange: (items: ConfirmEquipmentItem[]) => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [detections, setDetections] = useState<Record<string, Detection>>({});
  const [pickerSlot, setPickerSlot] = useState<EquipmentSlot | null>(null);

  const { data: catalog } = useQuery<EquipmentCatalogSlot[]>(
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

  // Report confirmed gear upward whenever the working set changes.
  useEffect(() => {
    const items: ConfirmEquipmentItem[] = (EQUIPMENT_SLOTS as readonly EquipmentSlot[])
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
    onChange(items);
  }, [detections, onChange]);

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

  const handleFile = useCallback(
    async (file: File) => {
      if (!catalog || catalog.length === 0) {
        setError("Icon library is still loading — try again in a moment.");
        setPhase("error");
        return;
      }
      setError(null);
      setProgress(0);
      setPhase("scanning");
      try {
        const dataUrl = await readAsDataUrl(file);
        setPreviewUrl(dataUrl);
        const image = await loadDataUrl(dataUrl);
        let matched: Record<string, { item: EquipmentCatalogItem | null; confidence: number; needsReview: boolean; cropSig?: IconSignature | null }>;
        try {
          const auto = await matchEquipmentAuto(image, catalog, setProgress);
          matched =
            auto.regions >= 4 ? auto.result : await matchEquipmentByImage(image, catalog, setProgress);
        } catch (e) {
          console.warn("[gear-scan] auto detect failed, using layout fallback", e);
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
        console.error("[gear-scan] failed", err);
        setError(err instanceof Error ? err.message : "The screenshot could not be processed.");
        setPhase("error");
      }
    },
    [catalog],
  );

  const reset = () => {
    setPhase("idle");
    setPreviewUrl(null);
    setDetections({});
    setError(null);
    setProgress(0);
  };

  const matchedCount = useMemo(
    () => Object.values(detections).filter((d) => d.item).length,
    [detections],
  );
  const reviewCount = useMemo(
    () => Object.values(detections).filter((d) => d.needsReview).length,
    [detections],
  );

  return (
    <div className="space-y-3">
      {phase === "idle" && <UploadDropzone onFile={handleFile} />}
      {phase === "scanning" && <ScanProgress progress={progress} previewUrl={previewUrl} />}
      {phase === "error" && <ErrorState message={error || "Something went wrong."} onRetry={reset} />}

      {phase === "review" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3.5 py-2.5">
            <span className="text-xs font-semibold text-white">Detected gear</span>
            <span className="text-[11px] text-emerald-300">{matchedCount} matched</span>
            {reviewCount > 0 && <span className="text-[11px] text-amber-300">{reviewCount} need review</span>}
            <button
              type="button"
              onClick={reset}
              className="ml-auto text-[11px] font-medium text-white/45 hover:text-white/80"
            >
              Rescan
            </button>
          </div>
          <EquipmentGrid views={reviewViews} previewUrl={previewUrl} onSlotClick={(slot) => setPickerSlot(slot)} />
          <p className="text-[11px] text-white/40">Tap any slot to correct it. Gear is optional and submitted with your application.</p>
        </div>
      )}

      {pickerSlot && catalogBySlot.get(pickerSlot) && (
        <CorrectionPicker
          slot={catalogBySlot.get(pickerSlot)!}
          currentPath={detections[pickerSlot]?.item?.path ?? null}
          cropSig={detections[pickerSlot]?.cropSig ?? null}
          onSelect={(item) => {
            setDetections((prev) => ({ ...prev, [pickerSlot]: { item, confidence: 1, needsReview: false } }));
            setPickerSlot(null);
          }}
          onClear={() => {
            setDetections((prev) => ({ ...prev, [pickerSlot]: { item: null, confidence: 0, needsReview: false } }));
            setPickerSlot(null);
          }}
          onClose={() => setPickerSlot(null)}
        />
      )}
    </div>
  );
}
