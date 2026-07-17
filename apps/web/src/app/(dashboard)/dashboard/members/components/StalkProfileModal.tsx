"use client";

import { useRef, useState } from "react";
import { type GuildMemberData, authApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/Toast";
import { queryClient } from "@/lib/query";
import Avatar from "@/components/ui/Avatar";
import { getColor } from "../utils";

export interface MemberWithFinance extends GuildMemberData {
  balance: number;
  guildPoints: number;
  currencySymbol: string;
}

export interface StalkProfileModalProps {
  selectedStalkMember: MemberWithFinance | null;
  activeGuildName: string;
  guildId: string;
  currentUserId: string;
  isOnline: boolean;
  onClose: () => void;
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function readImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Please upload a valid image file (PNG, JPG, WEBP)."));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      reject(new Error("Image file size must be less than 8MB."));
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => (e.target?.result ? resolve(e.target.result as string) : reject(new Error("Failed to read image")));
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
}

type EditableField = "ign" | "class" | "weapon" | "cp" | null;

/** The single popup for full member details — opened by clicking a member
 *  row. When viewing your own card, every field here is directly editable
 *  (Discord-style): avatar/banner upload, inline text/number edits — all of
 *  which save immediately and sync everywhere (Settings page, Sidebar,
 *  roster, other open sessions) via the shared auth endpoints. */
export default function StalkProfileModal({
  selectedStalkMember,
  activeGuildName,
  guildId,
  currentUserId,
  isOnline,
  onClose,
}: StalkProfileModalProps) {
  const { refreshUser } = useAuth();
  const { addToast } = useToast();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [bannerBusy, setBannerBusy] = useState(false);
  const [editingField, setEditingField] = useState<EditableField>(null);
  const [draft, setDraft] = useState("");
  const [savingField, setSavingField] = useState(false);

  if (!selectedStalkMember) return null;
  const m = selectedStalkMember;
  const isSelf = m.userId === currentUserId;

  function afterSave() {
    queryClient.invalidateQueries(`guild_members:${guildId}`);
    if (isSelf) refreshUser();
  }

  async function handleAvatarFile(file: File) {
    setAvatarBusy(true);
    try {
      const dataUrl = await readImageFile(file);
      const res = await authApi.uploadAvatar(dataUrl);
      if (res.success) {
        addToast("success", "Profile photo updated");
        afterSave();
      } else {
        addToast("error", res.error?.message || "Failed to upload avatar");
      }
    } catch (err: any) {
      addToast("error", err?.message || "Failed to upload avatar");
    } finally {
      setAvatarBusy(false);
    }
  }

  async function handleBannerFile(file: File) {
    setBannerBusy(true);
    try {
      const dataUrl = await readImageFile(file);
      const res = await authApi.uploadBanner(dataUrl);
      if (res.success) {
        addToast("success", "Banner updated");
        afterSave();
      } else {
        addToast("error", res.error?.message || "Failed to upload banner");
      }
    } catch (err: any) {
      addToast("error", err?.message || "Failed to upload banner");
    } finally {
      setBannerBusy(false);
    }
  }

  function startEdit(field: Exclude<EditableField, null>, currentValue: string) {
    if (!isSelf || savingField) return;
    setEditingField(field);
    setDraft(currentValue);
  }

  async function saveField() {
    if (!editingField) return;
    setSavingField(true);
    try {
      const payload: { ign?: string | null; cp?: number | null; class?: string | null; weapon?: string | null } = {};
      if (editingField === "cp") {
        const num = draft.trim() === "" ? null : parseInt(draft.replace(/[^0-9]/g, ""), 10);
        if (num !== null && Number.isNaN(num)) {
          addToast("error", "Combat Power must be a number");
          setSavingField(false);
          return;
        }
        payload.cp = num;
      } else {
        payload[editingField] = draft.trim() || null;
      }
      const res = await authApi.updateCharacterProfile(payload);
      if (res.success) {
        afterSave();
        setEditingField(null);
      } else {
        addToast("error", res.error?.message || "Failed to save");
      }
    } catch (err: any) {
      addToast("error", err?.message || "Failed to save");
    } finally {
      setSavingField(false);
    }
  }

  function cancelEdit() {
    setEditingField(null);
    setDraft("");
  }

  function handleFieldKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") saveField();
    else if (e.key === "Escape") cancelEdit();
  }

  const editableFieldClass = isSelf
    ? "cursor-pointer rounded-md hover:bg-white/[0.06] transition-colors -mx-1 px-1"
    : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-md"
        onClick={onClose}
      />

      <div className="relative w-[360px] max-w-full bg-[#111214] rounded-3xl border border-white/[0.08] shadow-2xl shadow-black/80 overflow-hidden z-50 animate-scale-in text-zinc-300">

        {/* Banner — Discord style top banner, uploadable when viewing your own card */}
        <div
          className={`relative h-[105px] w-full group ${isSelf ? "cursor-pointer" : ""} ${
            m.user.bannerUrl ? "" : `bg-gradient-to-r ${getColor(m.ign || m.user.displayName)}`
          }`}
          onClick={() => isSelf && !bannerBusy && bannerInputRef.current?.click()}
        >
          {m.user.bannerUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.user.bannerUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          )}
          {isSelf && (
            <div className={`absolute inset-0 flex items-center justify-center bg-black/50 transition-opacity ${bannerBusy ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
              {bannerBusy ? (
                <span className="text-[11px] font-semibold text-white">Uploading…</span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
                  Change banner
                </span>
              )}
            </div>
          )}
          <input
            ref={bannerInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleBannerFile(file);
              e.target.value = "";
            }}
          />
        </div>

        {/* Avatar Container */}
        <div className="absolute top-[65px] left-[18px]">
          <div
            className={`relative inline-block rounded-full p-[5px] bg-[#111214] group ${isSelf ? "cursor-pointer" : ""}`}
            onClick={() => isSelf && !avatarBusy && avatarInputRef.current?.click()}
          >
            <Avatar
              name={m.ign || m.user.displayName}
              src={m.user.avatarUrl}
              size="xl"
              className="h-[80px] w-[80px] rounded-full object-cover border-4 border-[#111214]"
            />
            {isSelf && (
              <div className={`absolute inset-[5px] rounded-full flex items-center justify-center bg-black/55 transition-opacity ${avatarBusy ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
              </div>
            )}
            {/* Status Dot — reflects live presence on the guild's realtime channel */}
            <span
              className={`absolute bottom-1 right-1 h-5.5 w-5.5 rounded-full border-4 border-[#111214] ${
                isOnline ? "bg-emerald-500" : "bg-white/25"
              }`}
            />
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleAvatarFile(file);
                e.target.value = "";
              }}
            />
          </div>
        </div>

        {/* Card Content */}
        <div className="px-5 pt-12 pb-5 space-y-4">
          {/* Identity — IGN is the highlighted primary name */}
          <div>
            {editingField === "ign" ? (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleFieldKeyDown}
                onBlur={saveField}
                disabled={savingField}
                placeholder="Your IGN"
                className="w-full text-xl font-bold text-white bg-white/[0.06] rounded-md px-1.5 py-0.5 -mx-1.5 focus:outline-none focus:ring-1 focus:ring-white/20"
              />
            ) : (
              <h3
                className={`text-xl font-bold text-white flex items-center gap-1.5 leading-snug truncate ${editableFieldClass}`}
                onClick={() => startEdit("ign", m.ign || "")}
                title={isSelf ? "Click to edit" : undefined}
              >
                {m.ign || "IGN not set"}
                {m.memberCode && <span className="text-[12px] text-zinc-500 font-normal shrink-0">#{m.memberCode.slice(-4)}</span>}
              </h3>
            )}
            <p className="text-[12px] text-zinc-500 mt-0.5 truncate flex items-center gap-1.5">
              {m.user.displayName}
              <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${isOnline ? "text-emerald-400" : "text-zinc-600"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? "bg-emerald-400" : "bg-zinc-600"}`} />
                {isOnline ? "Online" : "Offline"}
              </span>
            </p>
          </div>

          {/* Divider */}
          <div className="border-t border-white/[0.04]" />

          {/* Balance & Guild Points — headline financial stats (always read-only) */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-[#1c1d20]/75 border border-white/[0.03]">
              <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Balance</p>
              <p className={`text-[15px] font-bold mt-0.5 ${m.balance >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {m.currencySymbol}{m.balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-[#1c1d20]/75 border border-white/[0.03]">
              <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Guild Points</p>
              <p className="text-[15px] font-bold mt-0.5 text-[var(--forge-gold-bright,#f5c451)]">
                {m.guildPoints.toLocaleString()}
              </p>
            </div>
          </div>

          {/* Discord-style "About Me" / "Playing" Section */}
          <div className="space-y-3">
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">CHARACTER STATS</p>

            <div className="p-3.5 rounded-xl bg-[#1c1d20]/75 border border-white/[0.03] space-y-3">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-[#2b2d31] flex items-center justify-center text-xl shadow-inner shrink-0">
                  🛡️
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-bold text-white uppercase tracking-wider">{m.rankName || "Rank"}</p>
                  <p className="text-[11px] text-zinc-400 mt-0.5 truncate">Active in {activeGuildName}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 pt-1 text-[11px] border-t border-white/[0.04]">
                <div>
                  <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Combat Power</p>
                  {editingField === "cp" ? (
                    <input
                      autoFocus
                      type="number"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={handleFieldKeyDown}
                      onBlur={saveField}
                      disabled={savingField}
                      className="w-full text-amber-400 font-bold bg-white/[0.06] rounded-md px-1.5 py-0.5 -mx-1.5 mt-0.5 focus:outline-none focus:ring-1 focus:ring-white/20"
                    />
                  ) : (
                    <p
                      className={`text-amber-400 font-bold mt-0.5 ${editableFieldClass}`}
                      onClick={() => startEdit("cp", m.cp != null ? String(m.cp) : "")}
                      title={isSelf ? "Click to edit" : undefined}
                    >
                      {m.cp != null ? m.cp.toLocaleString() : "0"} CP
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Class</p>
                  {editingField === "class" ? (
                    <input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={handleFieldKeyDown}
                      onBlur={saveField}
                      disabled={savingField}
                      className="w-full text-white font-medium bg-white/[0.06] rounded-md px-1.5 py-0.5 -mx-1.5 mt-0.5 focus:outline-none focus:ring-1 focus:ring-white/20"
                    />
                  ) : (
                    <p
                      className={`text-white font-medium truncate mt-0.5 ${editableFieldClass}`}
                      onClick={() => startEdit("class", m.class || "")}
                      title={isSelf ? "Click to edit" : undefined}
                    >
                      {m.class || "Not Configured"}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Weapon</p>
                  {editingField === "weapon" ? (
                    <input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={handleFieldKeyDown}
                      onBlur={saveField}
                      disabled={savingField}
                      className="w-full text-white font-medium bg-white/[0.06] rounded-md px-1.5 py-0.5 -mx-1.5 mt-0.5 focus:outline-none focus:ring-1 focus:ring-white/20"
                    />
                  ) : (
                    <p
                      className={`text-white font-medium truncate mt-0.5 ${editableFieldClass}`}
                      onClick={() => startEdit("weapon", m.weapon || "")}
                      title={isSelf ? "Click to edit" : undefined}
                    >
                      {m.weapon || "Not Configured"}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Joined</p>
                  <p className="text-white font-medium truncate mt-0.5">
                    {new Date(m.joinedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Discord Roles Badges Section */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">GUILD ROLES</p>
            <div className="flex flex-wrap gap-1.5">
              <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-white/[0.06] border border-white/[0.12] text-white tracking-wider uppercase">
                {m.customRole?.name ?? m.role.replace(/_/g, " ")}
              </span>
            </div>
          </div>

          {/* Footer actions */}
          <div className="pt-2 border-t border-white/[0.04] flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors text-xs font-semibold text-white cursor-pointer"
            >
              Close Card
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
