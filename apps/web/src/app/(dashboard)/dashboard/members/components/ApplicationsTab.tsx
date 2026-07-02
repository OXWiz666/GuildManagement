"use client";

import { type JoinRequestData } from "@/lib/api";
import { EQUIPMENT_SLOT_LABELS } from "@guild/shared";
import { publicIconUrl } from "@/lib/storage";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Avatar from "@/components/ui/Avatar";
import { SkeletonCard } from "@/components/ui/Skeleton";

export interface ApplicationsTabProps {
  applications: JoinRequestData[];
  isLoadingApps: boolean;
  isReviewingId: string | null;
  isGuildLeader: boolean;
  loadApplications: () => void;
  handleReviewApplication: (requestId: string, action: "ACCEPT" | "DECLINE") => void;
}

export default function ApplicationsTab({
  applications,
  isLoadingApps,
  isReviewingId,
  isGuildLeader,
  loadApplications,
  handleReviewApplication,
}: ApplicationsTabProps) {
  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white">Pending Applications</h2>
        <Button variant="ghost" size="xs" onClick={loadApplications} isLoading={isLoadingApps}>
          Refresh
        </Button>
      </div>

      {isLoadingApps ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <SkeletonCard key={i} className="h-32" />
          ))}
        </div>
      ) : applications.length === 0 ? (
        <p className="text-white/40 text-center py-8">No pending applications</p>
      ) : (
        <div className="space-y-4">
          {applications.map((app) => (
            <div
              key={app.id}
              className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.05] flex flex-col md:flex-row md:items-center justify-between gap-4 animate-scale-in"
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

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="px-2.5 py-1.5 rounded bg-white/[0.03] border border-white/[0.05]">
                    <p className="text-[9px] font-medium text-white/35 uppercase">IGN</p>
                    <p className="text-xs font-semibold text-white mt-0.5 truncate">{app.ign}</p>
                  </div>
                  <div className="px-2.5 py-1.5 rounded bg-white/[0.03] border border-white/[0.05]">
                    <p className="text-[9px] font-medium text-white/35 uppercase">CP</p>
                    <p className="text-xs font-semibold text-amber-400 mt-0.5 truncate">
                      {app.cp.toLocaleString()}
                    </p>
                  </div>
                  <div className="px-2.5 py-1.5 rounded bg-white/[0.03] border border-white/[0.05]">
                    <p className="text-[9px] font-medium text-white/35 uppercase">Class</p>
                    <p className="text-xs font-semibold text-white mt-0.5 truncate">{app.class}</p>
                  </div>
                  <div className="px-2.5 py-1.5 rounded bg-white/[0.03] border border-white/[0.05]">
                    <p className="text-[9px] font-medium text-white/35 uppercase">Weapon</p>
                    <p className="text-xs font-semibold text-white mt-0.5 truncate">{app.weapon}</p>
                  </div>
                </div>

                {app.gearItems && app.gearItems.length > 0 && (
                  <div>
                    <p className="text-[9px] font-medium text-white/35 uppercase mb-1.5">
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

              <div className="flex sm:flex-row md:flex-col lg:flex-row gap-2 shrink-0 self-end md:self-center w-full md:w-auto">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => handleReviewApplication(app.id, "DECLINE")}
                  disabled={isReviewingId !== null || !isGuildLeader}
                  isLoading={isReviewingId === app.id}
                  className="grow md:grow-0"
                >
                  Decline
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleReviewApplication(app.id, "ACCEPT")}
                  disabled={isReviewingId !== null || !isGuildLeader}
                  isLoading={isReviewingId === app.id}
                  className="grow md:grow-0"
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
