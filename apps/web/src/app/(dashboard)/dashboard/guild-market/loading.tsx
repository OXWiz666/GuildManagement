import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";

export default function GuildMarketLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-56 rounded-xl" />
      <Skeleton className="h-12 w-full max-w-md rounded-xl" />
      <div className="space-y-4">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}
