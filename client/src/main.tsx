import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { toast } from "sonner";
import App from "./App";
import "./index.css";
const queryClient = new QueryClient({ defaultOptions: {
  queries: { networkMode: "always", retry: false },
  mutations: { networkMode: "always", retry: false },
} });
queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") toast.error("Could not read local data", { description: String(event.query.state.error) });
});
if (typeof BroadcastChannel !== "undefined") {
  const channel = new BroadcastChannel("attendance-changes");
  channel.onmessage = () => void queryClient.invalidateQueries();
}
createRoot(document.getElementById("root")!).render(<QueryClientProvider client={queryClient}><App /></QueryClientProvider>);
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").then(async () => {
      await navigator.serviceWorker.ready;
      toast.success("Ready for offline use", { description: "Students and attendance are saved on this device." });
      await navigator.storage?.persist?.();
    }).catch(() => toast.error("Offline setup failed", { description: "Reconnect and reload to download the app for offline use." }));
  });
}
