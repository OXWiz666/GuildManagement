"use client";

import { useState } from "react";
import { type CustomRoleData } from "@/lib/api";
import { type MemberWithFinance } from "./StalkProfileModal";
import { useRoleDisplayNames } from "@/lib/useRoleDisplayNames";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";

export const ASSIGNABLE_ROLES = [
  { value: "GUILD_LEADER", description: "Manage guild" },
  { value: "OFFICER", description: "Attendance, member management" },
  { value: "CORE_MEMBER", description: "High-rank member" },
  { value: "ELITE_MEMBER", description: "Mid-rank member" },
  { value: "MEMBER", description: "Standard permissions" },
] as const;

export interface MemberRowProps {
  member: MemberWithFinance;
  index: number;
  isGuildLeader: boolean;
  currentUserId: string;
  onSelect: () => void;
  onRoleChange: (newRole: string) => void;
  customRoles?: CustomRoleData[];
  onAssignCustomRole?: (customRoleId: string) => void;
}

export default function MemberRow({
  member,
  index,
  isGuildLeader,
  currentUserId,
  onSelect,
  onRoleChange,
  customRoles = [],
  onAssignCustomRole,
}: MemberRowProps) {
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const { resolveRoleName } = useRoleDisplayNames();
  const isSelf = member.userId === currentUserId;

  return (
    <div
      onClick={onSelect}
      className="glass rounded-2xl relative transition-all duration-300 hover:bg-white/[0.04] hover:ring-1 hover:ring-white/10 cursor-pointer select-none"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="flex items-center gap-4 p-4">
        {/* Avatar */}
        <Avatar
          name={member.ign || member.user.displayName}
          src={member.user.avatarUrl}
          size="lg"
        />

        {/* Identity — IGN is the highlighted primary name */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-white truncate">
              {member.ign || <span className="italic text-white/40 font-normal">IGN not set</span>}
            </h3>
            {isSelf && (
              <span className="px-1.5 py-0.5 text-[10px] font-medium bg-primary-500/15 text-white rounded-full">
                You
              </span>
            )}
            <Badge role={member.role} customName={member.customRole?.name} customColor={member.customRole?.color} />
          </div>
          <p className="text-[11px] text-white/35 truncate mt-0.5">{member.user.displayName}</p>
        </div>

        {/* Combat Power, Balance & Guild Points */}
        <div className="hidden sm:flex items-center gap-4 shrink-0 pr-1">
          <div className="text-right">
            <p className="text-[9px] font-medium text-white/30 uppercase tracking-wider">Combat Power</p>
            <p className="text-[12px] font-bold font-mono text-white/80">
              {member.cp != null ? member.cp.toLocaleString() : <span className="text-white/25">—</span>}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-medium text-white/30 uppercase tracking-wider">Balance</p>
            <p className={`text-[12px] font-bold font-mono ${member.balance >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {member.currencySymbol}{member.balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-medium text-white/30 uppercase tracking-wider">Guild Points</p>
            <p className="text-[12px] font-bold font-mono text-[var(--forge-gold-bright,#f5c451)]">
              {member.guildPoints.toLocaleString()}
            </p>
          </div>
        </div>

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
                                {resolveRoleName(role.value)}
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
                    {customRoles.length > 0 && (
                      <>
                        <div className="p-2 pt-3 border-t border-white/[0.05] mt-1">
                          <p className="text-[10px] font-medium text-white/40 uppercase tracking-wider px-1">
                            Custom Roles
                          </p>
                        </div>
                        {customRoles.map((role) => {
                          const isCurrentRole = member.customRole?.id === role.id;
                          return (
                            <button
                              key={role.id}
                              onClick={() => {
                                if (!isCurrentRole) {
                                  onAssignCustomRole?.(role.id);
                                  setShowRoleMenu(false);
                                }
                              }}
                              disabled={isCurrentRole}
                              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors cursor-pointer ${
                                isCurrentRole ? "bg-primary-500/8 cursor-default" : "hover:bg-white/[0.04]"
                              }`}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-medium text-white">{role.name}</span>
                                  {isCurrentRole && (
                                    <svg className="h-3 w-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                      <path d="M20 6L9 17l-5-5" />
                                    </svg>
                                  )}
                                </div>
                                <p className="text-[10px] text-white/35 mt-0.5">{resolveRoleName(role.band)}-level</p>
                              </div>
                            </button>
                          );
                        })}
                      </>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
