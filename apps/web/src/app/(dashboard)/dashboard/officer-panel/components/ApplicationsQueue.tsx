"use client";

import { type JoinRequestData } from "@/lib/api";
import { EQUIPMENT_SLOT_LABELS } from "@guild/shared";
import { publicIconUrl } from "@/lib/storage";
import Button from "@/components/ui/Button";
import Avatar from "@/components/ui/Avatar";
import Card from "@/components/ui/Card";

interface ApplicationsQueueProps {
  applications: JoinRequestData[];
  isLoading: boolean;
  isReviewingId: string | null;
  onRefresh: () => void;
  onReview: (requestId: string, action: "ACCEPT" | "DECLINE") => void;
}

export default function ApplicationsQueue({
  applications,
  isLoading,
  isReviewingId,
  onRefresh,
  onReview,
}: ApplicationsQueueProps) {
  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-md font-bold text-white">Pending Recruitment Requests</h3>
        <Button
          variant="ghost"
          size="xs"
          onClick={onRefresh}
          isLoading={isLoading}
        >
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-xs text-white/35 italic animate-pulse">
          Loading applications...
        </div>
      ) : applications.length === 0 ? (
        <div className="py-12 text-center text-xs text-white/35 italic">
          No pending recruitment requests found.
        </div>
      ) : (
        <div className="space-y-4">
          {applications.map((app) => (
            <div
              key={app.id}
              className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:border-white/[0.08] flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all"
            >
              <div className="space-y-3 flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <Avatar
                    name={app.user?.displayName || "Applicant"}
                    src={app.user?.avatarUrl}
                    size="md"
                  />
                  <div>
                    <p className="text-sm font-semibold text-white truncate">
                      {app.user?.displayName}
                    </p>
                    <p className="text-xs text-white/40 truncate">{app.user?.email}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[12px]">
                  <div className="px-2 py-1 rounded bg-white/[0.02] border border-white/[0.04]">
                    <p className="text-[9px] font-medium text-white/30 uppercase">IGN</p>
                    <p className="font-semibold text-white mt-0.5 truncate">{app.ign}</p>
                  </div>
                  <div className="px-2 py-1 rounded bg-white/[0.02] border border-white/[0.04]">
                    <p className="text-[9px] font-medium text-white/30 uppercase">CP</p>
                    <p className="font-semibold text-amber-400 mt-0.5 truncate">
                      {app.cp.toLocaleString()}
                    </p>
                  </div>
                  <div className="px-2 py-1 rounded bg-white/[0.02] border border-white/[0.04]">
                    <p className="text-[9px] font-medium text-white/30 uppercase">Class</p>
                    <p className="font-semibold text-white mt-0.5 truncate">{app.class}</p>
                  </div>
                  <div className="px-2 py-1 rounded bg-white/[0.02] border border-white/[0.04]">
                    <p className="text-[9px] font-medium text-white/30 uppercase">Weapon</p>
                    <p className="font-semibold text-white mt-0.5 truncate">{app.weapon}</p>
                  </div>
                </div>

                {app.gearItems && app.gearItems.length > 0 && (
                  <div>
                    <p className="text-[9px] font-medium text-white/30 uppercase mb-1.5">
                      Submitted gear · {app.gearItems.length}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {app.gearItems.map((g) => (
                        <div
                          key={g.slotType}
                          title={`${EQUIPMENT_SLOT_LABELS[g.slotType as keyof typeof EQUIPMENT_SLOT_LABELS] || g.slotType}: ${g.itemName}${g.rarity ? ` (${g.rarity})` : ""}`}
                          className="h-9 w-9 overflow-hidden rounded-md border border-white/[0.1] bg-black/30"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={publicIconUrl(g.iconBucket, g.iconPath)}
                            alt={g.itemName}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex sm:flex-row md:flex-col lg:flex-row gap-2 shrink-0 md:self-center w-full md:w-auto border-t md:border-t-0 border-white/[0.04] pt-3 md:pt-0">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => onReview(app.id, "DECLINE")}
                  disabled={isReviewingId !== null}
                  isLoading={isReviewingId === app.id}
                  className="flex-1 md:flex-none"
                >
                  Decline
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => onReview(app.id, "ACCEPT")}
                  disabled={isReviewingId !== null}
                  isLoading={isReviewingId === app.id}
                  className="flex-1 md:flex-none"
                >
                  Accept
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
