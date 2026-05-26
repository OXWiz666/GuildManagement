"use client";

import { type BossData } from "@/lib/api";
import Button from "@/components/ui/Button";
import { ImageUrlField } from "@/components/dashboard/DashboardHelpers";

export interface AddScheduleModalProps {
  showAddModal: boolean;
  setShowAddModal: (val: boolean) => void;
  bossName: string;
  setBossName: (val: string) => void;
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  showSuggestions: boolean;
  setShowSuggestions: (val: boolean) => void;
  bossImageUrl: string;
  setBossImageUrl: (val: string) => void;
  spawnDate: string;
  setSpawnDate: (val: string) => void;
  spawnTime: string;
  setSpawnTime: (val: string) => void;
  location: string;
  setLocation: (val: string) => void;
  guildTurn: string;
  setGuildTurn: (val: string) => void;
  isFactionWide: boolean;
  setIsFactionWide: (val: boolean) => void;
  isSubmitting: boolean;
  handleAddSchedule: (e: React.FormEvent) => void;
  bosses: BossData[];
  getFixedSpawnDaysText: (bossName: string) => string;
}

export default function AddScheduleModal({
  showAddModal,
  setShowAddModal,
  bossName,
  setBossName,
  searchQuery,
  setSearchQuery,
  showSuggestions,
  setShowSuggestions,
  bossImageUrl,
  setBossImageUrl,
  spawnDate,
  setSpawnDate,
  spawnTime,
  setSpawnTime,
  location,
  setLocation,
  guildTurn,
  setGuildTurn,
  isFactionWide,
  setIsFactionWide,
  isSubmitting,
  handleAddSchedule,
  bosses,
  getFixedSpawnDaysText,
}: AddScheduleModalProps) {
  if (!showAddModal) return null;

  const selectedBossObj = bosses.find((b) => b.name.toLowerCase() === bossName.toLowerCase());
  const isFixedSchedule = selectedBossObj?.type === "FIXED_SCHEDULE";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm" 
        onClick={() => !isSubmitting && setShowAddModal(false)} 
      />
      <div className="relative glass-strong rounded-2xl p-6 max-w-md w-full mx-4 animate-scale-in z-50">
        <h3 className="text-lg font-bold text-white mb-4">Schedule Boss Spawn</h3>
        <form onSubmit={handleAddSchedule} className="space-y-4">
          <div className="relative">
            <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Boss Registry Search</label>
            <input
              type="text"
              placeholder="Type to search boss registry (e.g. Benji, Venatus)..."
              value={searchQuery}
              onChange={(e) => {
                const val = e.target.value;
                setSearchQuery(val);
                setBossName(val);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              required
              className="w-full px-4 py-2.5 rounded-xl bg-[#0f0f16] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-white/25"
            />
            
            {showSuggestions && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowSuggestions(false)} />
                <div className="absolute z-50 left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-xl border border-white/10 bg-[#0f0f16]/95 backdrop-blur-md shadow-2xl p-2 space-y-1">
                  {bosses
                    .filter((boss) =>
                      boss.name.toLowerCase().includes(searchQuery.toLowerCase())
                    )
                    .map((boss) => (
                      <div
                        key={boss.id}
                        onClick={() => {
                          setBossName(boss.name);
                          setSearchQuery(boss.name);
                          setLocation(boss.location);
                          setShowSuggestions(false);
                        }}
                        className="px-3 py-2 rounded-lg hover:bg-white/[0.04] cursor-pointer text-sm text-left flex justify-between items-center transition-all"
                      >
                        <div>
                          <p className="font-semibold text-white">{boss.name}</p>
                          <p className="text-xs text-white/50">📍 {boss.location}</p>
                        </div>
                        <div className="text-right">
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-white/[0.05] text-white/85 border border-white/[0.10]">
                            Lv {boss.level}
                          </span>
                          <p className="text-[10px] text-white/40 mt-1">
                            {boss.type === "LONG_CYCLE" ? `⏱️ ${boss.cooldownHours}h respawn` : "📅 Fixed Schedule"}
                          </p>
                        </div>
                      </div>
                    ))}
                  {bosses.filter((boss) =>
                    boss.name.toLowerCase().includes(searchQuery.toLowerCase())
                  ).length === 0 && (
                    <div className="text-xs text-white/40 p-2 text-center">
                      No predefined boss found. Using custom name.
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <ImageUrlField
            label="Boss image URL (optional)"
            value={bossImageUrl}
            onChange={setBossImageUrl}
            placeholder="https://example.com/boss.jpg"
            shape="square"
            helperText="Custom artwork for this boss"
          />

          {/* Spawn Date & Time Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className={isFixedSchedule ? "col-span-2" : ""}>
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Spawn Date</label>
              <input
                type="date"
                value={spawnDate}
                onChange={(e) => setSpawnDate(e.target.value)}
                required
                className="w-full px-4 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-white/25"
              />
            </div>
            
            {!isFixedSchedule ? (
              <div>
                <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Spawn Time (Local)</label>
                <input
                  type="time"
                  value={spawnTime}
                  onChange={(e) => setSpawnTime(e.target.value)}
                  required
                  className="w-full px-4 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-white/25 font-mono"
                />
              </div>
            ) : null}
          </div>

          {/* Fixed Spawn Helper Label */}
          {isFixedSchedule && (
            <div className="p-3 rounded-xl bg-primary-500/5 border border-primary-500/10 text-xs text-white/70 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-white/85 font-semibold">
                <span>📅 Fixed Schedule Spawn</span>
              </div>
              <p className="text-[11px] text-white/50 leading-relaxed mt-0.5">
                Time is auto-resolved to: <strong className="text-white font-mono text-xs">{spawnTime || "--:--"}</strong> based on predefined schedule:
              </p>
              <p className="text-[10px] text-white/85/80 italic mt-0.5">
                {getFixedSpawnDaysText(bossName)}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className={!isFactionWide ? "md:col-span-2" : ""}>
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Location Coordinates</label>
              <input
                type="text"
                placeholder="e.g. Fire Cave Lvl 3"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                required
                className="w-full px-4 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-white/25"
              />
            </div>
            
            {isFactionWide && (
              <div>
                <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Guild Turn (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Dragon Knights"
                  value={guildTurn}
                  onChange={(e) => setGuildTurn(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-white/25"
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 py-2">
            <input
              type="checkbox"
              id="faction-wide"
              checked={isFactionWide}
              onChange={(e) => setIsFactionWide(e.target.checked)}
              className="rounded border-white/10 text-primary-500 focus:ring-primary-500 cursor-pointer h-4 w-4 bg-white/[0.04]"
            />
            <label htmlFor="faction-wide" className="text-xs font-semibold text-white/70 cursor-pointer select-none">
              Make Faction Unified Event (Visible to all guilds)
            </label>
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t border-white/[0.05]">
            <Button variant="ghost" size="sm" type="button" onClick={() => setShowAddModal(false)}>Cancel</Button>
            <Button variant="primary" size="sm" type="submit" isLoading={isSubmitting}>Schedule</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
