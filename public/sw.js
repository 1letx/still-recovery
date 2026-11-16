// Still — offline support.
// Network first (so a new deploy shows up on the next load), but if the network
// is slow or offline we answer from cache after a short timeout. Only the
// app's own files are cached; nothing else ever passes through here.
const CACHE = "still-v3";
const TIMEOUT_MS = 2500;
const SHELL = [
  "/",
  "/css/app.css",
  "/js/app.js",
  "/js/calc.js",
  "/js/data.js",
  "/js/html.js",
  "/js/sessions.js",
  "/js/store.js",
  "/js/ui.js",
  "/manifest.webmanifest",
  "/icons/favicon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const fromNetwork = (request) =>
  fetch(request).then((res) => {
    if (res.ok && res.type === "basic") {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(request, copy));
    }
    return res;
  });

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  // the app shell is one page; every navigation is served by "/"
  const key = request.mode === "navigate" ? "/" : request;

  event.respondWith(
    (async () => {
      const network = fromNetwork(request);
      network.catch(() => {}); // a late failure after we already answered from cache is fine
      const cached = caches.match(key);
      const timeout = new Promise((resolve) => setTimeout(resolve, TIMEOUT_MS));
      try {
        const first = await Promise.race([network, timeout.then(() => cached)]);
        if (first) return first;
        return await network;
      } catch {
        return (await cached) || Response.error();
      }
    })()
  );
});
