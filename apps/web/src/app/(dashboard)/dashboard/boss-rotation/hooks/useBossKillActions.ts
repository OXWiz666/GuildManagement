import { useCallback, useRef, useState } from "react";
import {
  dashboardApi,
  type BossKilledHistoryEntry,
  type BossRotationItem,
  type FactionGuildData,
} from "@/lib/api";
import { queryClient } from "@/lib/query";
import { toDateTimeInputValue } from "../utils/helpers";
import type { SelectedDrop } from "../components/BossDropsPicker";
import { CONFIRM_TAKEN_TIMEOUT_MS } from "../constants";
import type { ActiveGuildRef } from "../types";

type Toast = (type: "success" | "error", message: string) => void;

// Owns every write path on this page: taking a boss (with the Confirm Taken
// modal's own state), editing a past kill's time, resetting timers, and the
// maintenance reset flow. Depends on `takingGuilds` and `canManage` from the
// other hooks (for the kill modal's default guild and permission gating) and
// `refetchRotation` to re-pull after a mutation.
export function useBossKillActions(
  activeGuild: ActiveGuildRef,
  addToast: Toast,
  refetchRotation: () => void,
  takingGuilds: FactionGuildData[],
  canManage: boolean,
) {
  const [killTarget, setKillTarget] = useState<BossRotationItem | null>(null);
  const [killTime, setKillTime] = useState("");
  const [selectedTakenGuildId, setSelectedTakenGuildId] = useState("");
  const [killDrops, setKillDrops] = useState<SelectedDrop[]>([]);
  const [showDropsPicker, setShowDropsPicker] = useState(false);
  const [isKilling, setIsKilling] = useState(false);
  const isKillingRef = useRef(false);

  const [saleModalKill, setSaleModalKill] = useState<BossKilledHistoryEntry | null>(null);
  const [editingHistoryKill, setEditingHistoryKill] = useState<BossKilledHistoryEntry | null>(null);
  const [editHistoryKillTime, setEditHistoryKillTime] = useState("");
  const [isEditingHistoryKill, setIsEditingHistoryKill] = useState(false);

  const [showResetModal, setShowResetModal] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [isMaintenanceResetting, setIsMaintenanceResetting] = useState(false);

  // Only guilds that actually hold a turn for this boss in the Master List
  // rotation queue may take it. Guilds absent from the master list are NOT
  // eligible and must not appear in the "Taking Guild" picker. If a boss has no
  // configured participants at all, fall back to every faction guild so the
  // modal stays usable rather than showing an empty list.
  const modalGuildQueue = killTarget
    ? killTarget.queue.length > 0
      ? Array.from(new Map(killTarget.queue.map((guild) => [guild.id, guild])).values())
      : takingGuilds
    : [];

  const selectedTakenGuild = modalGuildQueue.find((guild) => guild.id === selectedTakenGuildId) || null;
  const previewNextGuild = selectedTakenGuild && modalGuildQueue.length > 0
    ? modalGuildQueue[(modalGuildQueue.findIndex((guild) => guild.id === selectedTakenGuild.id) + 1) % modalGuildQueue.length] || null
    : null;
  const canConfirmTaken = Boolean(killTarget && killTime && selectedTakenGuild && !isKilling);
  const canSaveHistoryEdit = Boolean(editingHistoryKill && editHistoryKillTime && editingHistoryKill.bossScheduleId && !isEditingHistoryKill);

  // Stable reference (vs. an inline `() => openKillModal(rotation)` per
  // card) so RotationCard's memo isn't defeated by a fresh closure on every
  // parent render — the card passes itself as the argument instead.
  const openKillModal = useCallback(
    (rotation: BossRotationItem) => {
      isKillingRef.current = false;
      setIsKilling(false);
      const defaultGuildId =
        rotation.activeSchedule?.guildTurnGuildId ||
        rotation.currentGuild?.id ||
        rotation.queue[0]?.id ||
        takingGuilds[0]?.id ||
        "";
      setKillTarget(rotation);
      setKillTime(toDateTimeInputValue(new Date()));
      setSelectedTakenGuildId(defaultGuildId);
      setKillDrops([]);
    },
    [takingGuilds],
  );

  const openHistoryKillEditModal = useCallback(
    (kill: BossKilledHistoryEntry) => {
      if (!canManage) return;
      setSaleModalKill(null);
      setEditingHistoryKill(kill);
      setEditHistoryKillTime(toDateTimeInputValue(new Date(kill.killedAt)));
    },
    [canManage],
  );

  async function confirmKill() {
    if (isKillingRef.current || !activeGuild || !killTarget || !killTime || !selectedTakenGuild) return;
    isKillingRef.current = true;
    setIsKilling(true);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), CONFIRM_TAKEN_TIMEOUT_MS);
    try {
      const killedAt = new Date(killTime).toISOString();
      const dropsPayload = killDrops.map((d) => ({
        bucket: d.item.bucket,
        path: d.item.path,
        quantity: d.quantity,
        customName: d.customName,
      }));
      const result = killTarget.activeSchedule
        ? await dashboardApi.markBossRotationKilled(
            activeGuild.guildId,
            killTarget.activeSchedule.id,
            killedAt,
            selectedTakenGuild.id,
            controller.signal,
            dropsPayload,
          )
        : await dashboardApi.markBossRotationKilledByName(
            activeGuild.guildId,
            killTarget.bossName,
            killedAt,
            selectedTakenGuild.id,
            controller.signal,
            dropsPayload,
          );
      window.clearTimeout(timeoutId);
      if (result.success) {
        addToast("success", `${killTarget.bossName} taken by ${selectedTakenGuild?.name || "selected guild"}. Next spawn has been calculated.`);
        setKillTarget(null);
        setSelectedTakenGuildId("");
        queryClient.invalidateQueries(`boss_rotation_v2:${activeGuild.guildId}`);
        queryClient.invalidateQueries(`boss_schedules:${activeGuild.guildId}`);
        queryClient.invalidateQueries(`boss_rotation_audit:${activeGuild.guildId}`);
        queryClient.invalidateQueries(`boss_killed_history:${activeGuild.guildId}`);
        void refetchRotation();
      } else {
        addToast("error", result.error?.message || "Failed to mark boss taken");
      }
    } catch (error) {
      window.clearTimeout(timeoutId);
      if (error instanceof DOMException && error.name === "AbortError") {
        addToast("error", "Confirm taken timed out. Refreshing boss rotation status.");
        if (activeGuild) {
          queryClient.invalidateQueries(`boss_rotation_v2:${activeGuild.guildId}`);
          queryClient.invalidateQueries(`boss_schedules:${activeGuild.guildId}`);
          void refetchRotation();
        }
      } else {
        addToast("error", "Failed to mark boss taken");
      }
    } finally {
      window.clearTimeout(timeoutId);
      isKillingRef.current = false;
      setIsKilling(false);
    }
  }

  async function saveHistoryKillEdit() {
    if (!activeGuild || !editingHistoryKill || !editHistoryKillTime || isEditingHistoryKill) return;
    if (!editingHistoryKill.bossScheduleId) {
      addToast("error", "This history entry cannot be edited because it is not linked to a schedule.");
      return;
    }

    setIsEditingHistoryKill(true);
    try {
      const killedAt = new Date(editHistoryKillTime).toISOString();
      const result = await dashboardApi.editBossKillHistoryEntry(activeGuild.guildId, editingHistoryKill.id, killedAt);
      if (result.success) {
        addToast("success", `${editingHistoryKill.bossName} kill time updated.`);
        setEditingHistoryKill(null);
        setEditHistoryKillTime("");
        queryClient.invalidateQueries(`boss_rotation_v2:${activeGuild.guildId}`);
        queryClient.invalidateQueries(`boss_schedules:${activeGuild.guildId}`);
        queryClient.invalidateQueries(`boss_rotation_audit:${activeGuild.guildId}`);
        queryClient.invalidateQueries(`boss_killed_history:${activeGuild.guildId}`);
        void refetchRotation();
      } else {
        addToast("error", result.error?.message || "Failed to update kill time");
      }
    } catch {
      addToast("error", "Failed to update kill time");
    } finally {
      setIsEditingHistoryKill(false);
    }
  }

  function invalidateRotationQueries() {
    if (!activeGuild) return;
    queryClient.invalidateQueries(`boss_rotation_v2:${activeGuild.guildId}`);
    queryClient.invalidateQueries(`boss_schedules:${activeGuild.guildId}`);
    queryClient.invalidateQueries(`boss_rotation_audit:${activeGuild.guildId}`);
    void refetchRotation();
  }

  async function handleResetAllTimers() {
    if (!activeGuild || isResetting) return;
    setIsResetting(true);
    try {
      const result = await dashboardApi.resetBossTimers(activeGuild.guildId);
      if (result.success) {
        addToast("success", "All boss timers have been reset from now.");
        setShowResetModal(false);
        invalidateRotationQueries();
      } else {
        addToast("error", result.error?.message || "Failed to reset boss timers");
      }
    } catch {
      addToast("error", "Failed to reset boss timers");
    } finally {
      setIsResetting(false);
    }
  }

  async function handleMaintenanceReset(maintenanceEndTime: Date) {
    if (!activeGuild || isMaintenanceResetting) return;
    setIsMaintenanceResetting(true);
    try {
      const result = await dashboardApi.maintenanceResetBossTimers(
        activeGuild.guildId,
        maintenanceEndTime.toISOString(),
      );
      if (result.success) {
        addToast("success", "Cycle boss timers reset for maintenance.");
        setShowMaintenanceModal(false);
        invalidateRotationQueries();
      } else {
        addToast("error", result.error?.message || "Failed to run maintenance reset");
      }
    } catch {
      addToast("error", "Failed to run maintenance reset");
    } finally {
      setIsMaintenanceResetting(false);
    }
  }

  return {
    killTarget,
    setKillTarget,
    killTime,
    setKillTime,
    selectedTakenGuildId,
    setSelectedTakenGuildId,
    killDrops,
    setKillDrops,
    showDropsPicker,
    setShowDropsPicker,
    isKilling,
    modalGuildQueue,
    selectedTakenGuild,
    previewNextGuild,
    canConfirmTaken,
    openKillModal,
    confirmKill,

    saleModalKill,
    setSaleModalKill,
    editingHistoryKill,
    setEditingHistoryKill,
    editHistoryKillTime,
    setEditHistoryKillTime,
    isEditingHistoryKill,
    canSaveHistoryEdit,
    openHistoryKillEditModal,
    saveHistoryKillEdit,

    showResetModal,
    setShowResetModal,
    isResetting,
    handleResetAllTimers,

    showMaintenanceModal,
    setShowMaintenanceModal,
    isMaintenanceResetting,
    handleMaintenanceReset,
  };
}
