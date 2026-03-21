import { ActivityListSkeleton } from '@/components/ActivityListSkeleton';

export default function ActivityLoading() {
  return (
    <div className="min-h-screen bg-black text-white flex flex-col safe-area-top safe-area-bottom">
      <header className="w-full flex justify-between items-center px-4 py-3 border-b-4 border-[#CCFF00]/20 shrink-0">
        <div className="chart-loading-skeleton h-8 w-24 rounded-sm" />
        <div className="chart-loading-skeleton h-9 w-28 rounded-sm" />
      </header>
      <main className="flex-1 px-4 pt-4 overflow-y-auto">
        <ActivityListSkeleton count={4} label="Loading activity" />
      </main>
    </div>
  );
}
