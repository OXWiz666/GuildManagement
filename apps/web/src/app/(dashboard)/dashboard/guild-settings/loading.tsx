import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";

export default function GuildSettingsLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-56 rounded-xl" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
