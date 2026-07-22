"use client";

import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { useRoleDisplayNames } from "@/lib/useRoleDisplayNames";

export interface RoleConfirmModalProps {
  confirmModal: {
    memberId: string;
    memberName: string;
    currentRole: string;
    newRole: string;
    isTransfer: boolean;
  } | null;
  isUpdating: boolean;
  onClose: () => void;
  onConfirm: () => void;
  // True when the acting user holds the GUILD_LEADER seat themselves — the
  // transfer demotes them. A Faction Leader/Admin appointing a Guild Leader
  // keeps their own role (dual leadership).
  actorStepsDown?: boolean;
}

export default function RoleConfirmModal({
  confirmModal,
  isUpdating,
  onClose,
  onConfirm,
  actorStepsDown = true,
}: RoleConfirmModalProps) {
  const { resolveRoleName } = useRoleDisplayNames();

  if (!confirmModal) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => !isUpdating && onClose()}
      />
      <div className="relative glass-strong rounded-2xl p-6 max-w-md w-full mx-4 animate-scale-in">
        {confirmModal.isTransfer ? (
          <>
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center mx-auto mb-4">
              <svg className="h-7 w-7 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 15l-2-4h4l-2 4z" />
                <path d="M5 7l3 4L12 3l4 8 3-4v12H5V7z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-white text-center mb-2">
              Transfer Guild Leadership
            </h3>
            <p className="text-sm text-white/50 text-center mb-1">
              You are about to {actorStepsDown ? "transfer" : "assign"} Guild Leader to{" "}
              <span className="text-white font-medium">{confirmModal.memberName}</span>.
            </p>
            <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl p-3 my-4">
              <p className="text-xs text-amber-400/90 text-center">
                {actorStepsDown ? (
                  <>⚠️ You will be demoted to <span className="font-semibold">{resolveRoleName("OFFICER")}</span>. This action cannot be undone by you.</>
                ) : (
                  <>⚠️ You remain Faction Leader. If the guild already has a Guild Leader, they will be demoted to <span className="font-semibold">{resolveRoleName("OFFICER")}</span>.</>
                )}
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-white/[0.12] to-primary-600/20 border border-primary-500/30 flex items-center justify-center mx-auto mb-4">
              <svg className="h-7 w-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                <circle cx="8.5" cy="7" r="4" />
                <path d="M20 8v6M23 11h-6" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-white text-center mb-2">
              Change Member Role
            </h3>
            <p className="text-sm text-white/50 text-center">
              Change{" "}
              <span className="text-white font-medium">{confirmModal.memberName}</span>&apos;s
              role from{" "}
              <Badge role={confirmModal.currentRole} size="sm" />{" "}
              to{" "}
              <Badge role={confirmModal.newRole} size="sm" />
            </p>
          </>
        )}

        <div className="flex gap-3 mt-6">
          <Button
            variant="ghost"
            size="sm"
            fullWidth
            onClick={onClose}
            disabled={isUpdating}
          >
            Cancel
          </Button>
          <Button
            variant={confirmModal.isTransfer ? "danger" : "primary"}
            size="sm"
            fullWidth
            onClick={onConfirm}
            isLoading={isUpdating}
          >
            {confirmModal.isTransfer ? "Transfer Leadership" : "Confirm Change"}
          </Button>
        </div>
      </div>
    </div>
  );
}
