import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";

// Add title
document.title = "LYFEOS - Dashboard";

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        await reg.update();
      }
      const cacheNames = await caches.keys();
      for (const name of cacheNames) {
        if (name !== 'lyfeos-v24') {
          await caches.delete(name);
        }
      }
    } catch (e) {
      console.warn('SW cleanup error:', e);
    }
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>
);
