import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initOfflineQueueSync } from "@/lib/apiClient";

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {
      // PWA registration is best-effort.
    });
  });
}

initOfflineQueueSync();

createRoot(document.getElementById("root")!).render(<App />);
