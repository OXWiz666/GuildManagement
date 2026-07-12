"use client";

import { useState } from "react";
import { type GuildMemberData, type MemberCategoryData } from "@/lib/api";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";
import { categoryBadgeClass, categorySwatchClass } from "./categoryStyles";

export const ASSIGNABLE_ROLES = [
  { value: "GUILD_LEADER", label: "Guild Leader", description: "Manage guild" },
  { value: "OFFICER", label: "Officer", description: "Attendance, member management" },
  { value: "CORE_MEMBER", label: "Core Member", description: "High-rank member" },
  { value: "ELITE_MEMBER", label: "Elite Member", description: "Mid-rank member" },
  { value: "MEMBER", label: "Member", description: "Standard permissions" },
] as const;

export interface MemberRowProps {
  member: GuildMemberData;
  index: number;
  isGuildLeader: boolean;
  currentUserId: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onRoleChange: (newRole: string) => void;
  onAvatarClick?: () => void;
  categories?: MemberCategoryData[];
  onAssignCategory?: (categoryId: string | null) => void;
}

export default function MemberRow({
  member,
  index,
  isGuildLeader,
  currentUserId,
  isExpanded,
  onToggleExpand,
  onRoleChange,
  onAvatarClick,
  categories = [],
  onAssignCategory,
}: MemberRowProps) {
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const isSelf = member.userId === currentUserId;
  const canManageCategories = isGuildLeader && !!onAssignCategory;

  return (
    <div
      className="glass rounded-2xl relative transition-all duration-300 hover:bg-white/[0.04]"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Main row */}
      <div
        className="flex items-center gap-4 p-4 cursor-pointer select-none"
        onClick={onToggleExpand}
      >
        {/* Avatar */}
        <div
          onClick={(e) => {
            if (onAvatarClick) {
              e.stopPropagation();
              onAvatarClick();
            }
          }}
          className="hover:scale-105 active:scale-95 transition-all duration-200"
        >
          <Avatar
            name={member.user.displayName}
            src={member.user.avatarUrl}
            size="lg"
            className="cursor-pointer hover:ring-2 hover:ring-primary-500/50 transition-shadow"
          />
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-white truncate">
              {member.user.displayName}
            </h3>
            {isSelf && (
              <span className="px-1.5 py-0.5 text-[10px] font-medium bg-primary-500/15 text-white rounded-full">
                You
              </span>
            )}
            <Badge role={member.role} />
            {member.category && (
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${categoryBadgeClass(member.category.color)}`}>
                {member.category.name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {member.ign && (
              <span className="text-xs text-white/40">
                <span className="text-white/35">IGN:</span>{" "}
                <span className="text-white/50">{member.ign}</span>
              </span>
            )}
            {member.cp != null && (
              <span className="text-xs text-white/40">
                <span className="text-white/35">CP:</span>{" "}
                <span className="text-amber-400/80 font-medium">{member.cp.toLocaleString()}</span>
              </span>
            )}
            {member.memberCode && (
              <span className="text-xs text-white/40">
                <span className="text-white/35">Code:</span>{" "}
                <span className="text-white/50 font-mono">{member.memberCode}</span>
              </span>
            )}
          </div>
        </div>

        {/* Category assignment (Guild Leader only) */}
        {canManageCategories && (
          <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowCategoryMenu(!showCategoryMenu);
              }}
              className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] hover:bg-white/8 hover:border-primary-500/30 transition-all text-xs text-white/50 hover:text-white flex items-center gap-1.5 cursor-pointer"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
                <line x1="7" y1="7" x2="7.01" y2="7" />
              </svg>
              {member.category ? member.category.name : "Category"}
            </button>

            {showCategoryMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowCategoryMenu(false)} />
                <div className="absolute right-0 top-full mt-2 w-56 glass-strong rounded-xl border border-white/10 shadow-2xl z-40 overflow-hidden animate-scale-in">
                  <div className="p-2 border-b border-white/[0.05]">
                    <p className="text-[10px] font-medium text-white/40 uppercase tracking-wider px-2">
                      Assign Category
                    </p>
                  </div>
                  <div className="p-1.5 space-y-0.5 max-h-[300px] overflow-y-auto">
                    <button
                      onClick={() => {
                        if (member.category) onAssignCategory?.(null);
                        setShowCategoryMenu(false);
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                        !member.category ? "bg-primary-500/8 cursor-default" : "hover:bg-white/[0.04]"
                      }`}
                    >
                      <span className="h-3 w-3 rounded-full border border-white/25" />
                      <span className="text-xs text-white/70 flex-1">No category</span>
                      {!member.category && (
                        <svg className="h-3 w-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" /></svg>
                      )}
                    </button>
                    {categories.length === 0 ? (
                      <p className="text-[11px] text-white/35 px-3 py-2">No categories yet. Create one from “Customize Categories”.</p>
                    ) : (
                      categories.map((cat) => {
                        const isCurrent = member.category?.id === cat.id;
                        return (
                          <button
                            key={cat.id}
                            onClick={() => {
                              if (!isCurrent) onAssignCategory?.(cat.id);
                              setShowCategoryMenu(false);
                            }}
                            disabled={isCurrent}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                              isCurrent ? "bg-primary-500/8 cursor-default" : "hover:bg-white/[0.04]"
                            }`}
                          >
                            <span className={`h-3 w-3 rounded-full ${categorySwatchClass(cat.color)}`} />
                            <span className="text-xs text-white flex-1 truncate">{cat.name}</span>
                            {isCurrent && (
                              <svg className="h-3 w-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" /></svg>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Role management (Guild Leader only) */}
        {isGuildLeader && !isSelf && (
          <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              id={`role-btn-${member.id}`}
              onClick={(e) => {
                e.stopPropagation();
                setShowRoleMenu(!showRoleMenu);
              }}
              className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] hover:bg-white/8 hover:border-primary-500/30 transition-all text-xs text-white/50 hover:text-white flex items-center gap-1.5 cursor-pointer"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                <circle cx="8.5" cy="7" r="4" />
                <path d="M20 8v6M23 11h-6" />
              </svg>
              Change Role
            </button>

            {/* Role dropdown */}
            {showRoleMenu && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setShowRoleMenu(false)}
                />
                <div className="absolute right-0 top-full mt-2 w-56 glass-strong rounded-xl border border-white/10 shadow-2xl z-40 overflow-hidden animate-scale-in">
                  <div className="p-2 border-b border-white/[0.05]">
                    <p className="text-[10px] font-medium text-white/40 uppercase tracking-wider px-2">
                      Assign Role
                    </p>
                  </div>
                  <div className="p-1.5 space-y-0.5 max-h-[350px] overflow-y-auto">
                    {ASSIGNABLE_ROLES.map((role) => {
                      const isCurrentRole = member.role === role.value;
                      const isTransfer = role.value === "GUILD_LEADER";

                      return (
                        <button
                          key={role.value}
                          onClick={() => {
                            if (!isCurrentRole) {
                              onRoleChange(role.value);
                              setShowRoleMenu(false);
                            }
                          }}
                          disabled={isCurrentRole}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors cursor-pointer ${
                            isCurrentRole
                              ? "bg-primary-500/8 cursor-default"
                              : isTransfer
                                ? "hover:bg-amber-500/8"
                                : "hover:bg-white/[0.04]"
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-xs font-medium ${
                                  isCurrentRole
                                    ? "text-white"
                                    : isTransfer
                                      ? "text-amber-400"
                                      : "text-white"
                                }`}
                              >
                                {role.label}
                              </span>
                              {isCurrentRole && (
                                <svg className="h-3 w-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                  <path d="M20 6L9 17l-5-5" />
                                </svg>
                              )}
                              {isTransfer && !isCurrentRole && (
                                <span className="px-1 py-0.5 text-[9px] font-semibold bg-amber-500/15 text-amber-400 rounded">
                                  TRANSFER
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-white/35 mt-0.5">
                              {role.description}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Expand chevron */}
        <svg
          className={`h-4 w-4 text-white/35 shrink-0 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>

      {/* Expanded Profile */}
      {isExpanded && (
        <div className="border-t border-white/[0.05] p-4 rounded-b-2xl animate-slide-down">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <ProfileField label="IGN" value={member.ign} icon="🎮" />
            <ProfileField
              label="Combat Power"
              value={member.cp != null ? member.cp.toLocaleString() : null}
              icon="⚔️"
              highlight
            />
            <ProfileField label="Rank" value={member.rankName} icon="🏅" />
            <ProfileField label="Role" value={member.role.replace(/_/g, " ")} icon="👤" badge={member.role} />
            <ProfileField label="Category" value={member.category?.name ?? null} icon="🏷️" />
            <ProfileField label="Class" value={member.class} icon="🛡️" />
            <ProfileField label="Weapon" value={member.weapon} icon="🗡️" />
            <ProfileField label="Member Code" value={member.memberCode} icon="🔑" mono />
            <ProfileField
              label="Joined"
              value={new Date(member.joinedAt).toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
              icon="📅"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Profile Field Component ──────────────────────────────

export interface ProfileFieldProps {
  label: string;
  value: string | null | undefined;
  icon: string;
  highlight?: boolean;
  mono?: boolean;
  badge?: string;
}

export function ProfileField({
  label,
  value,
  icon,
  highlight = false,
  mono = false,
  badge,
}: ProfileFieldProps) {
  return (
    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
      <span className="text-base mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] font-medium text-white/35 uppercase tracking-wider">
          {label}
        </p>
        {badge ? (
          <div className="mt-1">
            <Badge role={badge} size="sm" />
          </div>
        ) : (
          <p
            className={`text-sm mt-0.5 truncate ${
              highlight
                ? "text-amber-400 font-semibold"
                : mono
                  ? "text-white/70 font-mono"
                  : "text-white"
            } ${!value ? "text-white/35 italic" : ""}`}
          >
            {value || "Not set"}
          </p>
        )}
      </div>
    </div>
  );
}
