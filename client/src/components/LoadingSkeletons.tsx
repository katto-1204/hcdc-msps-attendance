import { Skeleton } from "@/components/ui/skeleton";
export function TableSkeleton({ columns = 5 }: { columns?: number }) {
  return <>{Array.from({ length: 6 }, (_, row) => <tr key={row} aria-label={row === 0 ? "Loading rows" : undefined}>{Array.from({ length: columns }, (_, col) => <td key={col} className="px-5 py-4"><Skeleton className={`h-4 ${col === 0 ? "w-32" : "w-20"}`} /></td>)}</tr>)}</>;
}
export function ListSkeleton() {
  return <div role="status" aria-label="Loading records" className="space-y-5 p-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="flex items-center gap-3"><Skeleton className="h-9 w-9 rounded-xl" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/3" /></div></div>)}</div>;
}
