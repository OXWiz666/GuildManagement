"use client";

import { type GuildMemberData } from "@/lib/api";
import Avatar from "@/components/ui/Avatar";
import { getColor } from "../utils";

export interface StalkProfileModalProps {
  selectedStalkMember: GuildMemberData | null;
  activeGuildName: string;
  onClose: () => void;
}

export default function StalkProfileModal({
  selectedStalkMember,
  activeGuildName,
  onClose,
}: StalkProfileModalProps) {
  if (!selectedStalkMember) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-md"
        onClick={onClose}
      />
      
      <div className="relative w-[340px] bg-[#111214] rounded-3xl border border-white/[0.08] shadow-2xl shadow-black/80 overflow-hidden z-50 animate-scale-in text-zinc-300">
        
        {/* Banner - Discord style top banner */}
        <div className={`h-[105px] w-full bg-gradient-to-r ${getColor(selectedStalkMember.user.displayName)}`} />
        
        {/* Avatar Container */}
        <div className="absolute top-[65px] left-[18px]">
          <div className="relative inline-block rounded-full p-[5px] bg-[#111214]">
            <Avatar
              name={selectedStalkMember.user.displayName}
              src={selectedStalkMember.user.avatarUrl}
              size="xl"
              className="h-[80px] w-[80px] rounded-full object-cover border-4 border-[#111214]"
            />
            {/* Status Dot */}
            <span className="absolute bottom-1 right-1 h-5.5 w-5.5 rounded-full bg-emerald-500 border-4 border-[#111214]" />
          </div>
        </div>
        
        {/* Card Content */}
        <div className="px-5 pt-12 pb-5 space-y-4">
          {/* Identity */}
          <div>
            <h3 className="text-xl font-bold text-white flex items-center gap-1.5 leading-snug">
              {selectedStalkMember.user.displayName}
              <span className="text-[12px] text-zinc-500 font-normal">#{(selectedStalkMember.memberCode || "0000").slice(-4)}</span>
            </h3>
            <p className="text-[12px] text-zinc-500 mt-0.5">{selectedStalkMember.user.email}</p>
          </div>
          
          {/* Divider */}
          <div className="border-t border-white/[0.04]" />
          
          {/* Discord-style "About Me" / "Playing" Section */}
          <div className="space-y-3">
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">ABOUT ME</p>
            
            <div className="p-3.5 rounded-xl bg-[#1c1d20]/75 border border-white/[0.03] space-y-3">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-[#2b2d31] flex items-center justify-center text-xl shadow-inner shrink-0">
                  🛡️
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-bold text-white uppercase tracking-wider">CHARACTER STATS</p>
                  <p className="text-[11px] text-zinc-400 mt-0.5 truncate">Active in {activeGuildName}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 pt-1 text-[11px] border-t border-white/[0.04]">
                <div>
                  <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">IGN</p>
                  <p className="text-white font-medium truncate mt-0.5">{selectedStalkMember.ign || "Not Configured"}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Combat Power</p>
                  <p className="text-amber-400 font-bold mt-0.5">
                    {selectedStalkMember.cp != null ? selectedStalkMember.cp.toLocaleString() : "0"} CP
                  </p>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Class</p>
                  <p className="text-white font-medium truncate mt-0.5">{selectedStalkMember.class || "Not Configured"}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Weapon</p>
                  <p className="text-white font-medium truncate mt-0.5">{selectedStalkMember.weapon || "Not Configured"}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Discord Roles Badges Section */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">GUILD ROLES</p>
            <div className="flex flex-wrap gap-1.5">
              <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-white/[0.06] border border-white/[0.12] text-white tracking-wider uppercase">
                {selectedStalkMember.role.replace(/_/g, " ")}
              </span>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-zinc-800 border border-zinc-700 text-zinc-400 tracking-wider">
                {selectedStalkMember.rankName}
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
