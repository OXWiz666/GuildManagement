"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface ComboboxItem {
  key: string;
  label: string;
}

interface CheckboxComboboxProps {
  items: ComboboxItem[];
  selectedKeys: string[];
  onToggle: (key: string) => void;
  placeholder: string;
  /** Omit to render a plain (non-editable) checkbox list — e.g. Mount, whose
   * catalog is managed elsewhere on the page. */
  onRename?: (key: string, newLabel: string) => void;
  onAdd?: (label: string) => void;
  addPlaceholder?: string;
  emptyHint?: string;
  className?: string;
}

const MENU_WIDTH = 224;

/**
 * Dropdown-with-checkboxes: pick any number of catalog items, and — when
 * `onRename`/`onAdd` are supplied — rename an entry in place or add a new one
 * without leaving the control. Selection is by stable `key`, so renaming a
 * label never disturbs which tiers already have it checked.
 *
 * The popup renders through a portal at `position: fixed` instead of
 * `absolute` inside the trigger — this control is used inside a
 * horizontally-scrolling table (`overflow-x-auto`), and setting `overflow-x`
 * to anything but `visible` makes the browser compute `overflow-y` as `auto`
 * too (CSS overflow is only independent per-axis when both are `visible`).
 * That silently clipped the popup's bottom edge against the table wrapper
 * for any row not near the top. Portaling to `document.body` and positioning
 * from the trigger's own `getBoundingClientRect()` sidesteps the ancestor's
 * overflow entirely.
 */
export default function CheckboxCombobox({
  items,
  selectedKeys,
  onToggle,
  placeholder,
  onRename,
  onAdd,
  addPlaceholder = "Add new…",
  emptyHint,
  className = "",
}: CheckboxComboboxProps) {
  const [open, setOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [newValue, setNewValue] = useState("");
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Positioned relative to the viewport, so it has to be (re)computed against
  // the trigger's live position each time the menu opens.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setMenuPos({
      top: rect.bottom + 6,
      left: Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
      setEditingKey(null);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setEditingKey(null);
      }
    }
    // The menu is `position: fixed` and doesn't track the trigger, so a
    // scroll of any ancestor (capture: true catches the table's own
    // scroll container, not just the window) would otherwise leave it
    // floating over the wrong spot — closing it is simpler than re-tracking
    // position on every scroll tick.
    function onScroll() {
      setOpen(false);
      setEditingKey(null);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  const selectedLabels = items.filter((i) => selectedKeys.includes(i.key)).map((i) => i.label);
  const summary = selectedLabels.length > 0 ? selectedLabels.join(", ") : placeholder;

  function startEdit(item: ComboboxItem) {
    setEditingKey(item.key);
    setEditValue(item.label);
  }

  function commitEdit() {
    if (editingKey && editValue.trim()) {
      onRename?.(editingKey, editValue.trim());
    }
    setEditingKey(null);
  }

  function submitAdd() {
    const label = newValue.trim();
    if (!label) return;
    onAdd?.(label);
    setNewValue("");
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 rounded-lg bg-surface-100 border border-white/8 text-white px-2.5 py-1.5 text-sm text-left focus:outline-none focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/20"
      >
        <span className={`truncate ${selectedLabels.length === 0 ? "text-white/40" : ""}`}>{summary}</span>
        <svg
          className={`h-3.5 w-3.5 shrink-0 text-white/40 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && menuPos && createPortal(
        <div
          ref={menuRef}
          style={{ position: "fixed", top: menuPos.top, left: menuPos.left, width: MENU_WIDTH }}
          className="z-50 max-h-72 overflow-y-auto rounded-lg border border-white/[0.1] bg-[#0b0c10] shadow-xl shadow-black/40 p-1.5"
        >
          {items.length === 0 ? (
            <p className="px-2 py-2 text-[11px] text-white/40">{emptyHint || "Nothing here yet."}</p>
          ) : (
            <ul className="space-y-0.5">
              {items.map((item) => (
                <li key={item.key} className="flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-white/[0.05]">
                  {editingKey === item.key ? (
                    <input
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={commitEdit}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit();
                        if (e.key === "Escape") setEditingKey(null);
                      }}
                      className="flex-1 min-w-0 rounded bg-white/[0.06] border border-primary-500/40 text-white text-xs px-1.5 py-1 focus:outline-none"
                    />
                  ) : (
                    <>
                      <label className="flex items-center gap-1.5 flex-1 min-w-0 cursor-pointer text-xs text-white/85">
                        <input
                          type="checkbox"
                          checked={selectedKeys.includes(item.key)}
                          onChange={() => onToggle(item.key)}
                          className="shrink-0 accent-[var(--forge-gold)]"
                        />
                        <span className="truncate">{item.label}</span>
                      </label>
                      {onRename && (
                        <button
                          type="button"
                          onClick={() => startEdit(item)}
                          className="shrink-0 p-1 rounded text-white/30 hover:text-white/70 hover:bg-white/[0.06]"
                          aria-label={`Rename ${item.label}`}
                        >
                          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z" />
                          </svg>
                        </button>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          {onAdd && (
            <div className="mt-1.5 pt-1.5 border-t border-white/[0.08] flex items-center gap-1">
              <input
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitAdd();
                }}
                placeholder={addPlaceholder}
                className="flex-1 min-w-0 rounded bg-white/[0.04] border border-white/[0.08] text-white text-xs px-1.5 py-1 placeholder:text-white/30 focus:outline-none focus:border-primary-500/40"
              />
              <button
                type="button"
                onClick={submitAdd}
                disabled={!newValue.trim()}
                className="shrink-0 px-1.5 py-1 rounded text-xs font-semibold text-[var(--forge-gold-bright)] hover:bg-white/[0.06] disabled:opacity-30 disabled:hover:bg-transparent"
              >
                Add
              </button>
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
