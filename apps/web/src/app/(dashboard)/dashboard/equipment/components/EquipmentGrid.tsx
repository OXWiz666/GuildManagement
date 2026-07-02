"use client";

import { EQUIPMENT_GRID, EQUIPMENT_SLOT_LABELS, EQUIPMENT_SLOTS, type EquipmentSlot } from "@guild/shared";
import SlotCard from "./SlotCard";

export interface SlotView {
  itemName: string | null;
  iconUrl: string | null;
  rarity: string | null;
  confidence: number | null;
  needsReview: boolean;
}

export default function EquipmentGrid({
  views,
  onSlotClick,
  previewUrl,
  readOnly,
}: {
  views: Record<string, SlotView>;
  onSlotClick?: (slot: EquipmentSlot) => void;
  previewUrl?: string | null;
  readOnly?: boolean;
}) {
  const left = (EQUIPMENT_SLOTS as readonly EquipmentSlot[])
    .filter((s) => EQUIPMENT_GRID[s].col === "left")
    .sort((a, b) => EQUIPMENT_GRID[a].row - EQUIPMENT_GRID[b].row);
  const right = (EQUIPMENT_SLOTS as readonly EquipmentSlot[])
    .filter((s) => EQUIPMENT_GRID[s].col === "right")
    .sort((a, b) => EQUIPMENT_GRID[a].row - EQUIPMENT_GRID[b].row);

  const column = (slots: EquipmentSlot[]) => (
    <div className="flex flex-col gap-2">
      {slots.map((slot) => {
        const v = views[slot] ?? { itemName: null, iconUrl: null, rarity: null, confidence: null, needsReview: false };
        return (
          <SlotCard
            key={slot}
            label={EQUIPMENT_SLOT_LABELS[slot]}
            itemName={v.itemName}
            iconUrl={v.iconUrl}
            rarity={v.rarity}
            confidence={v.confidence}
            needsReview={v.needsReview}
            readOnly={readOnly}
            onClick={onSlotClick ? () => onSlotClick(slot) : undefined}
          />
        );
      })}
    </div>
  );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_minmax(180px,260px)_1fr]">
      {column(left)}

      {/* Center: screenshot / character frame */}
      <div className="order-first lg:order-none">
        <div className="sticky top-4 overflow-hidden rounded-2xl border border-white/[0.08] bg-black/30">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="Equipment screenshot" className="h-full w-full object-contain" />
          ) : (
            <div className="flex aspect-[3/4] items-center justify-center text-white/20">
              <svg className="h-16 w-16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
              </svg>
            </div>
          )}
        </div>
      </div>

      {column(right)}
    </div>
  );
}
