"use client";

import { useRef, useState } from "react";
import Button from "@/components/ui/Button";

// Drag a box around just the equipment panel before scanning. On cluttered full-screen
// screenshots (battle scenes, skill bars, chat) the automatic panel detection can't
// isolate the 2×6 grid — cropping to the panel is what lets the accurate per-slot matcher
// run. Outputs a cropped data-URL scanned in place of the whole image.

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export default function CropSelector({
  imageUrl,
  onScan,
  onCancel,
}: {
  imageUrl: string;
  onScan: (dataUrl: string) => void;
  onCancel: () => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [sel, setSel] = useState<Rect | null>(null);

  const local = (e: React.PointerEvent) => {
    const r = imgRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(r.width, e.clientX - r.left)),
      y: Math.max(0, Math.min(r.height, e.clientY - r.top)),
      r,
    };
  };

  const onDown = (e: React.PointerEvent) => {
    const { x, y } = local(e);
    start.current = { x, y };
    setSel({ x, y, w: 0, h: 0 });
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    const { x, y } = local(e);
    const s = start.current;
    setSel({ x: Math.min(s.x, x), y: Math.min(s.y, y), w: Math.abs(x - s.x), h: Math.abs(y - s.y) });
  };
  const onUp = () => {
    start.current = null;
  };

  const hasSelection = !!sel && sel.w > 8 && sel.h > 8;

  const scanSelection = () => {
    const img = imgRef.current;
    if (!img || !hasSelection || !sel) {
      onScan(imageUrl);
      return;
    }
    const r = img.getBoundingClientRect();
    const sx = img.naturalWidth / r.width;
    const sy = img.naturalHeight / r.height;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sel.w * sx));
    canvas.height = Math.max(1, Math.round(sel.h * sy));
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(
      img,
      sel.x * sx,
      sel.y * sy,
      sel.w * sx,
      sel.h * sy,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    onScan(canvas.toDataURL("image/png"));
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-[var(--forge-gold)]/20 bg-[var(--forge-gold)]/[0.04] px-4 py-3 text-sm text-white/70">
        <span className="font-semibold text-white">Drag a box around your equipment panel</span> — the
        weapon, armor and accessory grid only. Cropping out the background gives far more accurate
        matches. Or scan the whole image.
      </div>

      <div className="relative inline-block select-none overflow-hidden rounded-lg border border-white/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={imageUrl}
          alt="crop"
          draggable={false}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          className="block max-h-[65vh] w-auto cursor-crosshair"
        />
        {sel && sel.w > 0 && sel.h > 0 && (
          <div
            className="pointer-events-none absolute border-2 border-[var(--forge-gold)] bg-[var(--forge-gold)]/10"
            style={{ left: sel.x, top: sel.y, width: sel.w, height: sel.h }}
          />
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="sm" onClick={scanSelection} disabled={!hasSelection}>
          Scan selection
        </Button>
        <Button variant="secondary" size="sm" onClick={() => onScan(imageUrl)}>
          Scan whole image
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
