import type { EquipmentSlot } from "@guild/shared";

// Relative positions of each equipment slot within the in-game Equipment panel,
// as fractions of the uploaded image (center-based box). Derived from the panel
// layout: Weapon (big, top-left), Gadget (big, top-right), then two rows of six
// with a center gap for the character —
//   row A: Helm, Upper Armor, Lower Armor | Earrings, Necklace, Bracelet
//   row B: Gloves, Boots, Cloak | Ring, Belt, Insignia
// Best results when the member uploads the panel itself (as it appears in-game).

export interface SlotBox {
  cx: number; // center x (0..1)
  cy: number; // center y (0..1)
  w: number; // width (0..1)
  h: number; // height (0..1)
}

const SMALL_W = 0.11;
const SMALL_H = 0.17;
const ROW_A = 0.56;
const ROW_B = 0.82;

export const PANEL_LAYOUT: Record<EquipmentSlot, SlotBox> = {
  weapon: { cx: 0.105, cy: 0.29, w: 0.18, h: 0.36 },
  gadget: { cx: 0.895, cy: 0.29, w: 0.18, h: 0.36 },

  helm: { cx: 0.155, cy: ROW_A, w: SMALL_W, h: SMALL_H },
  upperArmor: { cx: 0.278, cy: ROW_A, w: SMALL_W, h: SMALL_H },
  lowerArmor: { cx: 0.4, cy: ROW_A, w: SMALL_W, h: SMALL_H },
  earrings: { cx: 0.6, cy: ROW_A, w: SMALL_W, h: SMALL_H },
  necklace: { cx: 0.727, cy: ROW_A, w: SMALL_W, h: SMALL_H },
  bracelet: { cx: 0.86, cy: ROW_A, w: SMALL_W, h: SMALL_H },

  gloves: { cx: 0.155, cy: ROW_B, w: SMALL_W, h: SMALL_H },
  boots: { cx: 0.278, cy: ROW_B, w: SMALL_W, h: SMALL_H },
  cloak: { cx: 0.4, cy: ROW_B, w: SMALL_W, h: SMALL_H },
  ring: { cx: 0.6, cy: ROW_B, w: SMALL_W, h: SMALL_H },
  belt: { cx: 0.727, cy: ROW_B, w: SMALL_W, h: SMALL_H },
  insignia: { cx: 0.86, cy: ROW_B, w: SMALL_W, h: SMALL_H },
};
