/// <reference lib="webworker" />
import {
  Serwist,
  NetworkOnly,
  NetworkFirst,
  CacheFirst,
  ExpirationPlugin,
  type PrecacheEntry,
  type SerwistGlobalConfig,
} from "serwist";
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;
const sw = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: ({ url }) => url.pathname.startsWith("/api/"),
      handler: new NetworkOnly(),
    },
    // Documents contain only the public app shell; authenticated data is NEVER cached here.
    {
      matcher: ({ request }) => request.mode === "navigate",
      handler: new NetworkFirst({
        cacheName: "spplast-shell-v1",
        networkTimeoutSeconds: 3,
        plugins: [
          new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 86400 * 7 }),
        ],
      }),
    },
    {
      matcher: ({ url, request }) =>
        url.origin === self.location.origin &&
        (url.pathname.startsWith("/_next/static/") ||
          ["script", "style", "font", "image"].includes(request.destination)) &&
        !url.pathname.startsWith("/api"),
      handler: new CacheFirst({
        cacheName: "spplast-assets-v1",
        plugins: [
          new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 86400 * 30 }),
        ],
      }),
    },
  ],
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});
sw.addEventListeners();
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
});
self.addEventListener("sync", ((event: ExtendableEvent & { tag: string }) => {
  if (event.tag === "spplast-sync")
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        for (const client of clients)
          client.postMessage({ type: "SYNC_REQUESTED" });
      }),
    );
}) as EventListener);
