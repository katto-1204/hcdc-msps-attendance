import { useMutation, useQuery, useQueryClient, type UseMutationOptions } from "@tanstack/react-query";
import { localStore } from "./local-store";
function query<I, O>(key: string, fn: (input: I) => Promise<O>) {
  return { useQuery: (input?: I, options?: { enabled?: boolean }) => useQuery({ queryKey: [key, input], queryFn: () => fn(input as I), ...options }) };
}
function mutation<I, O>(fn: (input: I) => Promise<O>) {
  return { useMutation: (options: UseMutationOptions<O, Error, I> = {}) => {
    const client = useQueryClient();
    return useMutation({ ...options, mutationFn: fn, onSuccess: async (...args) => {
      await client.invalidateQueries();
      if (typeof BroadcastChannel !== "undefined") { const channel = new BroadcastChannel("attendance-changes"); channel.postMessage("changed"); channel.close(); }
      await options.onSuccess?.(...args);
    } });
  } };
}
export const localApi = {
  students: { list: query("students", localStore.list), create: mutation(localStore.create), update: mutation(localStore.update), archive: mutation(localStore.archive) },
  dashboard: { byDate: query("dashboard", localStore.dashboard) },
  attendance: { record: mutation(localStore.record), csv: query("csv", localStore.csv) },
  imports: { history: query("imports", localStore.history), masterlists: query("masterlists", localStore.masterlists), students: mutation(localStore.importStudents), resetRoster: mutation(localStore.resetRoster) },
  useUtils: () => {
    const client = useQueryClient(); const invalidate = (_input?: unknown) => client.invalidateQueries();
    return { students: { list: { invalidate } }, dashboard: { byDate: { invalidate } }, imports: { history: { invalidate }, masterlists: { invalidate } } };
  },
};
