// Minimal cache-first service worker for the Ashland Editor.
//
// What it does:
// - Caches the app shell (HTML + built JS/CSS/icons) on first visit so the
//   editor opens instantly and works on flaky connections.
// - Passes through Supabase / GitHub API calls untouched — only same-origin
//   GETs are intercepted, so writes never get stale.
// - Bumps CACHE on every deploy by Vite hash so the new build wins.
//
// The version string is updated in lockstep with a deploy by the build —
// for now it's static; bump manually when changing this file.

const VERSION = "v1";
const CACHE = "ashland-editor-" + VERSION;

// Pre-cache the bare shell. Vite-hashed assets are picked up lazily on
// first request so we don't have to list them here.
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      ),
    ]),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin GETs. Supabase/GitHub/3rd-party stays direct.
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  // Stale-while-revalidate: serve cache instantly, refresh in background.
  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(req).then((hit) => {
        const network = fetch(req)
          .then((resp) => {
            if (resp && resp.ok && resp.type === "basic") {
              cache.put(req, resp.clone());
            }
            return resp;
          })
          .catch(() => hit || cache.match("/index.html"));
        return hit || network;
      }),
    ),
  );
});
