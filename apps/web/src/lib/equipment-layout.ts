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

const SMALL_W = 0.1;
const SMALL_H = 0.16;
const ROW_A = 0.585;
const ROW_B = 0.85;

export const PANEL_LAYOUT: Record<EquipmentSlot, SlotBox> = {
  weapon: { cx: 0.115, cy: 0.31, w: 0.17, h: 0.34 },
  gadget: { cx: 0.885, cy: 0.31, w: 0.17, h: 0.34 },

  helm: { cx: 0.176, cy: ROW_A, w: SMALL_W, h: SMALL_H },
  upperArmor: { cx: 0.297, cy: ROW_A, w: SMALL_W, h: SMALL_H },
  lowerArmor: { cx: 0.415, cy: ROW_A, w: SMALL_W, h: SMALL_H },
  earrings: { cx: 0.585, cy: ROW_A, w: SMALL_W, h: SMALL_H },
  necklace: { cx: 0.706, cy: ROW_A, w: SMALL_W, h: SMALL_H },
  bracelet: { cx: 0.828, cy: ROW_A, w: SMALL_W, h: SMALL_H },

  gloves: { cx: 0.165, cy: ROW_B, w: SMALL_W, h: SMALL_H },
  boots: { cx: 0.283, cy: ROW_B, w: SMALL_W, h: SMALL_H },
  cloak: { cx: 0.403, cy: ROW_B, w: SMALL_W, h: SMALL_H },
  ring: { cx: 0.587, cy: ROW_B, w: SMALL_W, h: SMALL_H },
  belt: { cx: 0.706, cy: ROW_B, w: SMALL_W, h: SMALL_H },
  insignia: { cx: 0.826, cy: ROW_B, w: SMALL_W, h: SMALL_H },
};
