"use client";

import { useState, useEffect } from "react";
import { type BossData, type BossScheduleData } from "@/lib/api";
import Button from "@/components/ui/Button";
import { getBossImageUrl } from "@guild/shared";

export interface BatchItem {
  id: string; // unique local ID (e.g. boss.id + index)
  bossName: string;
  level: number;
  location: string;
  spawnTime: string;
  guildTurn: string;
  isFixedSchedule: boolean;
  fixedSpawnsText: string;
  bossImageUrl: string;
}

export interface AddScheduleModalProps {
  showAddModal: boolean;
  setShowAddModal: (val: boolean) => void;
  bosses: BossData[];
  isFactionLeader: boolean;
  isSubmitting: boolean;
  spawnDate: string;
  setSpawnDate: (val: string) => void;
  spawnTime: string;
  setSpawnTime: (val: string) => void;
  // Batch Add handler
  handleAddScheduleBatch: (
    spawnDate: string,
    isFactionWide: boolean,
    items: Array<{
      bossName: string;
      bossImageUrl?: string;
      spawnTime: string;
      location: string;
      guildTurn?: string;
    }>
  ) => Promise<void>;
  // Single Edit handler
  editingEvent: BossScheduleData | null;
  handleEditSchedule: (
    scheduleId: string,
    payload: {
      bossName?: string;
      bossImageUrl?: string;
      spawnTime?: string;
      location?: string;
      guildTurn?: string;
      isFaction?: boolean;
    }
  ) => Promise<void>;
}

export default function AddScheduleModal({
  showAddModal,
  setShowAddModal,
  bosses,
  isFactionLeader,
  isSubmitting,
  spawnDate,
  setSpawnDate,
  spawnTime,
  setSpawnTime,
  handleAddScheduleBatch,
  editingEvent,
  handleEditSchedule,
}: AddScheduleModalProps) {
  const [isFactionWide, setIsFactionWide] = useState(false);
  
  // States for Batch Scheduling (Add Mode)
  const [selectedItems, setSelectedItems] = useState<BatchItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  // States for Single Scheduling Edit (Edit Mode)
  const [editBossName, setEditBossName] = useState("");
  const [editSpawnTime, setEditSpawnTime] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editGuildTurn, setEditGuildTurn] = useState("");
  const [editBossImageUrl, setEditBossImageUrl] = useState("");

  // Initialize values based on mode (Edit vs Add)
  useEffect(() => {
    if (!showAddModal) return;

    if (editingEvent) {
      // Edit Mode
      const eventDate = new Date(editingEvent.spawnTime);
      const formattedDate = eventDate.toISOString().split("T")[0];
      const formattedTime = eventDate.toTimeString().substring(0, 5);

      setSpawnDate(formattedDate);
      setIsFactionWide(editingEvent.guildId === null);
      setEditBossName(editingEvent.bossName);
      setEditSpawnTime(formattedTime);
      setEditLocation(editingEvent.location);
      setEditGuildTurn(editingEvent.guildTurn || "");
      setEditBossImageUrl(editingEvent.bossImageUrl || "");
      setSelectedItems([]);
    } else {
      // Add Mode
      const todayStr = new Date().toISOString().split("T")[0];
      setSpawnDate(todayStr);
      setIsFactionWide(false);
      setSelectedItems([]);
      setSearchQuery("");
      setShowSuggestions(false);
    }
  }, [showAddModal, editingEvent]);

  // Helper: auto-resolve fixed schedule spawns
  const getFixedSpawnTime = (boss: BossData, dateStr: string): string => {
    if (boss.type !== "FIXED_SCHEDULE" || !boss.fixedSpawns) return "";
    
    const dateParts = dateStr.split("-");
    if (dateParts.length !== 3) return "";
    
    const year = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10) - 1;
    const day = parseInt(dateParts[2], 10);
    const targetDate = new Date(year, month, day);
    const dayOfWeek = targetDate.getDay();

    const match = boss.fixedSpawns.find((s) => s.day === dayOfWeek);
    if (match) {
      return `${String(match.hour).padStart(2, "0")}:${String(match.minute).padStart(2, "0")}`;
    } else if (boss.fixedSpawns.length > 0) {
      const first = boss.fixedSpawns[0];
      return `${String(first.hour).padStart(2, "0")}:${String(first.minute).padStart(2, "0")}`;
    }
    return "";
  };

  const getFixedSpawnDaysText = (boss: BossData): string => {
    if (boss.type !== "FIXED_SCHEDULE" || !boss.fixedSpawns) return "";
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return boss.fixedSpawns
      .map((s) => `${dayNames[s.day]} at ${String(s.hour).padStart(2, "0")}:${String(s.minute).padStart(2, "0")}`)
      .join(", ");
  };

  // Automatically update fixed spawn times if spawnDate changes (Add Mode)
  useEffect(() => {
    if (editingEvent || !spawnDate || selectedItems.length === 0) return;
    
    setSelectedItems((prev) =>
      prev.map((item) => {
        if (!item.isFixedSchedule) return item;
        const registryBoss = bosses.find((b) => b.name === item.bossName);
        if (!registryBoss) return item;
        const newTime = getFixedSpawnTime(registryBoss, spawnDate);
        return { ...item, spawnTime: newTime || item.spawnTime };
      })
    );
  }, [spawnDate, bosses, editingEvent]);

  // Handle boss selection (Add Mode)
  const handleSelectBoss = (boss: BossData) => {
    // Check if duplicate
    if (selectedItems.some((item) => item.bossName === boss.name)) {
      setSearchQuery("");
      setShowSuggestions(false);
      return;
    }

    const isFixed = boss.type === "FIXED_SCHEDULE";
    const resolvedTime = isFixed ? getFixedSpawnTime(boss, spawnDate) : new Date().toTimeString().substring(0, 5);
    const resolvedImage = getBossImageUrl(boss.name);

    const newItem: BatchItem = {
      id: `${boss.id}-${Date.now()}`,
      bossName: boss.name,
      level: boss.level,
      location: boss.location,
      spawnTime: resolvedTime,
      guildTurn: "",
      isFixedSchedule: isFixed,
      fixedSpawnsText: isFixed ? getFixedSpawnDaysText(boss) : "",
      bossImageUrl: resolvedImage,
    };

    setSelectedItems((prev) => [...prev, newItem]);
    setSearchQuery("");
    setShowSuggestions(false);
  };

  const handleRemoveItem = (id: string) => {
    setSelectedItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleUpdateItemField = (id: string, field: keyof BatchItem, value: string) => {
    setSelectedItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (editingEvent) {
      // Edit mode submission
      const fullSpawnTime = new Date(`${spawnDate}T${editSpawnTime}:00`);
      await handleEditSchedule(editingEvent.id, {
        bossName: editBossName.trim(),
        spawnTime: fullSpawnTime.toISOString(),
        location: editLocation.trim(),
        guildTurn: isFactionLeader && editGuildTurn.trim() ? editGuildTurn.trim() : undefined,
        bossImageUrl: editBossImageUrl.trim() || getBossImageUrl(editBossName),
        isFaction: isFactionWide,
      });
    } else {
      // Add mode submission
      if (selectedItems.length === 0) return;

      const payloadItems = selectedItems.map((item) => ({
        bossName: item.bossName,
        spawnTime: new Date(`${spawnDate}T${item.spawnTime}:00`).toISOString(),
        location: item.location.trim(),
        guildTurn: isFactionLeader && item.guildTurn.trim() ? item.guildTurn.trim() : undefined,
        bossImageUrl: item.bossImageUrl || getBossImageUrl(item.bossName),
      }));

      await handleAddScheduleBatch(spawnDate, isFactionWide, payloadItems);
    }
  };

  if (!showAddModal) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        onClick={() => !isSubmitting && setShowAddModal(false)}
      />
      
      <div className="relative glass-strong rounded-3xl p-6 max-w-lg w-full mx-4 animate-scale-in z-50 max-h-[85vh] flex flex-col shadow-2xl border border-white/[0.08]">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/[0.06] mb-4">
          <h3 className="text-base font-bold text-white uppercase tracking-wider">
            {editingEvent ? "✏️ Edit Boss Schedule" : "Schedule Bosses"}
          </h3>
          <button
            type="button"
            onClick={() => setShowAddModal(false)}
            className="text-white/40 hover:text-white transition-colors cursor-pointer text-sm"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 flex-1 overflow-y-auto pr-1 custom-scrollbar">
          {/* Global Event Configurations */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1.5">Spawn Date</label>
              <input
                type="date"
                value={spawnDate}
                onChange={(e) => setSpawnDate(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-xl bg-[#0f0f16] border border-white/[0.08] text-xs text-white focus:outline-none focus:border-white/20"
              />
            </div>
            
            <div className="flex items-center gap-2.5 pt-6">
              <input
                type="checkbox"
                id="faction-wide"
                checked={isFactionWide}
                onChange={(e) => setIsFactionWide(e.target.checked)}
                className="rounded border-white/10 text-primary-500 focus:ring-primary-500 cursor-pointer h-4 w-4 bg-white/[0.04]"
              />
              <label htmlFor="faction-wide" className="text-xs font-semibold text-white/60 cursor-pointer select-none">
                Faction Unified Event
              </label>
            </div>
          </div>

          {/* EDIT MODE RENDER */}
          {editingEvent ? (
            <div className="space-y-4 p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] animate-fade-in">
              <div className="flex items-center gap-3">
                <img
                  src={editBossImageUrl || getBossImageUrl(editBossName)}
                  alt={editBossName}
                  className="h-10 w-10 rounded-lg object-cover border border-white/10 shadow"
                />
                <div>
                  <h4 className="font-bold text-white text-sm">{editBossName}</h4>
                  <p className="text-[10px] text-white/40">Registry Match</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1.5">Spawn Time</label>
                  <input
                    type="time"
                    value={editSpawnTime}
                    onChange={(e) => setEditSpawnTime(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl bg-white/[0.02] border border-white/[0.08] text-xs text-white focus:outline-none focus:border-white/20 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1.5">Location Coordinate</label>
                  <input
                    type="text"
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl bg-white/[0.02] border border-white/[0.08] text-xs text-white focus:outline-none focus:border-white/20"
                  />
                </div>

                {isFactionLeader && isFactionWide && (
                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1.5">Guild Turn</label>
                    <input
                      type="text"
                      placeholder="e.g. Dragon Knights"
                      value={editGuildTurn}
                      onChange={(e) => setEditGuildTurn(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-white/[0.02] border border-white/[0.08] text-xs text-white focus:outline-none focus:border-white/20"
                    />
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ADD/BATCH MODE RENDER */
            <div className="space-y-4">
              {/* Autocomplete Registry Search */}
              <div className="relative">
                <label className="block text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1.5">Search Predefined Bosses</label>
                <input
                  type="text"
                  placeholder="Search and select bosses to schedule... (e.g. Venatus, Ego)"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#0f0f16] border border-white/[0.08] text-xs text-white focus:outline-none focus:border-white/20"
                />

                {showSuggestions && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowSuggestions(false)} />
                    <div className="absolute z-50 left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-xl border border-white/10 bg-[#0f0f16]/95 backdrop-blur-md shadow-2xl p-1.5 space-y-1">
                      {bosses
                        .filter((boss) => boss.name.toLowerCase().includes(searchQuery.toLowerCase()))
                        .map((boss) => (
                          <div
                            key={boss.id}
                            onClick={() => handleSelectBoss(boss)}
                            className="px-3 py-1.5 rounded-lg hover:bg-white/[0.04] cursor-pointer text-xs flex justify-between items-center text-left transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              <img
                                src={getBossImageUrl(boss.name)}
                                alt={boss.name}
                                className="h-6 w-6 rounded object-cover border border-white/5"
                              />
                              <div>
                                <span className="font-semibold text-white">{boss.name}</span>
                                <p className="text-[9px] text-white/40">📍 {boss.location}</p>
                              </div>
                            </div>
                            <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[8px] font-bold text-white/60">
                              Lv {boss.level}
                            </span>
                          </div>
                        ))}
                      {bosses.filter((boss) => boss.name.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                        <div className="text-[10px] text-white/40 p-2 text-center">No matching bosses found.</div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Dynamic Batch Selected Bosses Cards */}
              <div className="space-y-3">
                <span className="block text-[10px] font-bold text-white/40 uppercase tracking-widest">
                  Selected Batch ({selectedItems.length})
                </span>

                {selectedItems.length === 0 ? (
                  <div className="border border-dashed border-white/[0.06] rounded-2xl p-8 text-center text-xs text-white/30 italic">
                    No bosses added to this batch yet. Search and select above.
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                    {selectedItems.map((item) => (
                      <div
                        key={item.id}
                        className="p-3.5 rounded-2xl bg-white/[0.015] border border-white/[0.05] space-y-3 relative hover:border-white/10 transition-colors animate-scale-in"
                      >
                        {/* Selected Header */}
                        <div className="flex items-center justify-between border-b border-white/5 pb-2">
                          <div className="flex items-center gap-2.5">
                            <img
                              src={item.bossImageUrl}
                              alt={item.bossName}
                              className="h-8 w-8 rounded-lg object-cover border border-white/10"
                            />
                            <div>
                              <h4 className="font-bold text-white text-xs leading-none">{item.bossName}</h4>
                              <p className="text-[9px] text-white/40 mt-1">Level {item.level}</p>
                            </div>
                          </div>
                          
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.id)}
                            className="text-rose-400/70 hover:text-rose-400 transition-colors text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/5 hover:bg-rose-500/10 cursor-pointer"
                          >
                            Remove
                          </button>
                        </div>

                        {/* Batch Item Inputs */}
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[9px] font-bold text-white/30 uppercase tracking-wider mb-1">Local Time</label>
                            <input
                              type="time"
                              value={item.spawnTime}
                              onChange={(e) => handleUpdateItemField(item.id, "spawnTime", e.target.value)}
                              disabled={item.isFixedSchedule}
                              required
                              className="w-full px-2.5 py-1.5 rounded-lg bg-[#0c0d10] border border-white/5 text-[11px] text-white focus:outline-none font-mono disabled:opacity-50"
                            />
                          </div>

                          <div>
                            <label className="block text-[9px] font-bold text-white/30 uppercase tracking-wider mb-1">Location Coordinates</label>
                            <input
                              type="text"
                              value={item.location}
                              onChange={(e) => handleUpdateItemField(item.id, "location", e.target.value)}
                              required
                              className="w-full px-2.5 py-1.5 rounded-lg bg-[#0c0d10] border border-white/5 text-[11px] text-white focus:outline-none"
                            />
                          </div>

                          {isFactionLeader && isFactionWide && (
                            <div className="col-span-2">
                              <label className="block text-[9px] font-bold text-white/30 uppercase tracking-wider mb-1">Guild Turn</label>
                              <input
                                type="text"
                                placeholder="Specify which guild is assigned to this spawn..."
                                value={item.guildTurn}
                                onChange={(e) => handleUpdateItemField(item.id, "guildTurn", e.target.value)}
                                className="w-full px-2.5 py-1.5 rounded-lg bg-[#0c0d10] border border-white/5 text-[11px] text-white focus:outline-none"
                              />
                            </div>
                          )}

                          {item.isFixedSchedule && (
                            <p className="col-span-2 text-[9px] text-white/35 italic leading-relaxed">
                              📅 Predefined Spawn Days: <span className="text-white/60 font-semibold">{item.fixedSpawnsText}</span>
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3 justify-end pt-4 border-t border-white/[0.06] mt-6">
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => setShowAddModal(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              isLoading={isSubmitting}
              disabled={!editingEvent && selectedItems.length === 0}
            >
              {editingEvent ? "Save Changes" : `Schedule Boss (${selectedItems.length})`}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
