import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";

export default function BossAttendanceLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-56 rounded-xl" />
      <Skeleton className="h-40 w-full rounded-2xl" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}
