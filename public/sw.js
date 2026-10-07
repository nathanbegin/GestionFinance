/* Service worker de « Gestion des finances » : installation, accès hors ligne limité, notifications. */
const VERSION = "v2";
const STATIC_CACHE = `static-${VERSION}`;
const PAGES_CACHE = `pages-${VERSION}`;
// Seules ces pages sont conservées pour une utilisation sans réseau (saisie d'une transaction + liste d'attente).
const OFFLINE_PAGES = ["/nouvelle", "/attente"];
const FALLBACK = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const res = await fetch(new Request(FALLBACK, { cache: "reload" }));
        if (res.ok) {
          const cache = await caches.open(PAGES_CACHE);
          await cache.put(FALLBACK, res.clone());
          await cacheAssetsOf(await res.text());
        }
      } catch (e) {
        /* installation hors ligne : la page de secours sera conservée à la prochaine mise à jour */
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => ![STATIC_CACHE, PAGES_CACHE].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isPageRequest(req) {
  if (req.method !== "GET" || req.headers.get("rsc")) return false;
  return req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");
}

// Précharge les scripts et styles d'une page conservée, pour qu'elle fonctionne sans réseau.
async function cacheAssetsOf(html) {
  const urls = Array.from(new Set(html.match(/\/_next\/static\/[^"'\\\s)]+\.(?:js|css)/g) || [])).slice(0, 60);
  const cache = await caches.open(STATIC_CACHE);
  await Promise.all(
    urls.map(async (u) => {
      if (await cache.match(u)) return;
      try {
        const res = await fetch(u);
        if (res.ok) await cache.put(u, res);
      } catch (e) {
        /* hors ligne : tant pis */
      }
    }),
  );
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || req.method !== "GET") return;
  if (url.pathname.startsWith("/api/")) return; // données et envois : jamais en cache

  // Fichiers versionnés de l'application et icônes : d'abord le cache
  if (url.pathname.startsWith("/_next/static/") || url.pathname === "/pwa-icon") {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  if (!isPageRequest(req)) return;
  const keep = OFFLINE_PAGES.includes(url.pathname);

  event.respondWith(
    (async () => {
      try {
        let res;
        try {
          res = await (keep ? withTimeout(fetch(req), 8000) : fetch(req));
        } catch (first) {
          if (!self.navigator.onLine) throw first;
          await new Promise((r) => setTimeout(r, 1500)); // connexion en cours de rétablissement : un nouvel essai
          res = await (keep ? withTimeout(fetch(req), 8000) : fetch(req));
        }
        // On ne conserve que les pages normales (pas les redirections vers /login) de la liste autorisée
        if (keep && res.ok && !res.redirected) {
          const copy = res.clone();
          event.waitUntil(
            (async () => {
              const cache = await caches.open(PAGES_CACHE);
              await cache.put(url.pathname, copy.clone());
              await cacheAssetsOf(await copy.text());
            })().catch(() => {}),
          );
        }
        return res;
      } catch (e) {
        const cache = await caches.open(PAGES_CACHE);
        if (keep) {
          const page = await cache.match(url.pathname);
          if (page) return page;
        }
        if (req.mode === "navigate") return (await cache.match(FALLBACK)) || Response.error();
        return Response.error();
      }
    })(),
  );
});

// ----- Notifications -----
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Gestion des finances", {
      body: data.body || "",
      icon: "/pwa-icon?size=192",
      tag: data.tag || undefined,
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (new URL(c.url).origin === self.location.origin && "focus" in c) {
          if ("navigate" in c) c.navigate(target).catch(() => {});
          return c.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
