"use client";

import { useState } from "react";
import { guildApi, type MemberCategoryData } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import { queryClient } from "@/lib/query";
import { CATEGORY_COLORS, categoryBadgeClass, categorySwatchClass } from "./categoryStyles";

interface CategoryManagerModalProps {
  guildId: string;
  categories: MemberCategoryData[];
  onClose: () => void;
}

const EMPTY_DRAFT = { name: "", color: "amber", description: "" };

export default function CategoryManagerModal({ guildId, categories, onClose }: CategoryManagerModalProps) {
  const { addToast } = useToast();
  const [draft, setDraft] = useState<{ name: string; color: string; description: string }>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const categoriesKey = `guild_member_categories:${guildId}`;

  function refresh() {
    queryClient.invalidateQueries(categoriesKey);
    queryClient.invalidateQueries(`guild_members:${guildId}`);
  }

  function startEdit(cat: MemberCategoryData) {
    setEditingId(cat.id);
    setDraft({ name: cat.name, color: cat.color, description: cat.description || "" });
  }

  function resetForm() {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
  }

  async function save() {
    const name = draft.name.trim();
    if (!name) {
      addToast("error", "Category name is required");
      return;
    }
    setSaving(true);
    try {
      const result = editingId
        ? await guildApi.updateMemberCategory(guildId, editingId, {
            name,
            color: draft.color,
            description: draft.description.trim(),
          })
        : await guildApi.createMemberCategory(guildId, {
            name,
            color: draft.color,
            description: draft.description.trim() || undefined,
          });
      if (result.success) {
        addToast("success", editingId ? "Category updated" : "Category created");
        resetForm();
        refresh();
      } else {
        addToast("error", result.error?.message || "Failed to save category");
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove(cat: MemberCategoryData) {
    if (!confirm(`Delete the “${cat.name}” category? Members in it become uncategorized.`)) return;
    setBusyId(cat.id);
    try {
      const result = await guildApi.deleteMemberCategory(guildId, cat.id);
      if (result.success) {
        addToast("success", "Category deleted");
        if (editingId === cat.id) resetForm();
        refresh();
      } else {
        addToast("error", result.error?.message || "Failed to delete category");
      }
    } finally {
      setBusyId(null);
    }
  }

  async function move(cat: MemberCategoryData, direction: -1 | 1) {
    const ordered = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);
    const index = ordered.findIndex((c) => c.id === cat.id);
    const swapWith = ordered[index + direction];
    if (!swapWith) return;
    setBusyId(cat.id);
    try {
      await Promise.all([
        guildApi.updateMemberCategory(guildId, cat.id, { sortOrder: swapWith.sortOrder }),
        guildApi.updateMemberCategory(guildId, swapWith.id, { sortOrder: cat.sortOrder }),
      ]);
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  const ordered = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass-strong rounded-2xl p-6 max-w-lg w-full mx-4 animate-scale-in max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="text-lg font-bold text-white">Customize Categories</h3>
            <p className="text-xs text-white/45 mt-0.5">
              Define your own member categories, then assign them from each member&apos;s row.
            </p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white/80 cursor-pointer shrink-0" aria-label="Close">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Existing categories */}
        <div className="space-y-2 mb-5">
          {ordered.length === 0 ? (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 text-center">
              <p className="text-sm text-white/50">No categories yet</p>
              <p className="text-[11px] text-white/35 mt-1">Create your first one below.</p>
            </div>
          ) : (
            ordered.map((cat, i) => (
              <div key={cat.id} className="rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2.5 flex items-center gap-3">
                <div className="flex flex-col">
                  <button
                    onClick={() => move(cat, -1)}
                    disabled={i === 0 || busyId === cat.id}
                    className="text-white/30 hover:text-white/70 disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer leading-none"
                    aria-label="Move up"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 15l-6-6-6 6" /></svg>
                  </button>
                  <button
                    onClick={() => move(cat, 1)}
                    disabled={i === ordered.length - 1 || busyId === cat.id}
                    className="text-white/30 hover:text-white/70 disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer leading-none"
                    aria-label="Move down"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
                  </button>
                </div>
                <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${categoryBadgeClass(cat.color)}`}>
                  {cat.name}
                </span>
                {cat.description && <span className="text-[11px] text-white/40 truncate flex-1">{cat.description}</span>}
                <div className="ml-auto flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => startEdit(cat)}
                    className="text-[11px] text-white/50 hover:text-white px-2 py-1 cursor-pointer"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => remove(cat)}
                    disabled={busyId === cat.id}
                    className="text-[11px] text-red-300/80 hover:text-red-300 px-2 py-1 cursor-pointer disabled:opacity-40"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Create / edit form */}
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/45">
            {editingId ? "Edit category" : "New category"}
          </p>
          <input
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="Category name (e.g. Raid Core)"
            maxLength={32}
            className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-primary-500/40"
          />
          <input
            value={draft.description}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            placeholder="Description (optional)"
            maxLength={120}
            className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-primary-500/40"
          />
          <div className="flex items-center gap-2 flex-wrap">
            {CATEGORY_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => setDraft((d) => ({ ...d, color }))}
                className={`h-6 w-6 rounded-full ${categorySwatchClass(color)} transition-transform cursor-pointer ${
                  draft.color === color ? "ring-2 ring-white ring-offset-2 ring-offset-[#0f0f16] scale-110" : "opacity-70 hover:opacity-100"
                }`}
                aria-label={color}
              />
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            {editingId && (
              <Button variant="ghost" size="sm" onClick={resetForm} disabled={saving}>
                Cancel
              </Button>
            )}
            <Button variant="primary" size="sm" onClick={save} isLoading={saving} disabled={!draft.name.trim()}>
              {editingId ? "Save changes" : "Add category"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
