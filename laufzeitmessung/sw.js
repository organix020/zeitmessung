/* Laufzeitmessung: hält die Seite für den Betrieb ohne Internet vor. */
var CACHE = "laufzeitmessung-v1";
var CORE = ["index.html", "manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png"];
var FONT_CSS = "https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600&family=Barlow+Condensed:wght@500;600;700&display=swap";

// Umgeleitete Antworten darf der Browser nicht als Seitenaufruf ausliefern, daher neu verpacken.
function clean(res) {
  if (!res.redirected) return Promise.resolve(res);
  return res.blob().then(function (body) {
    return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
  });
}

function putFresh(cache, key, url) {
  return fetch(url, { cache: "no-cache" }).then(function (res) {
    if (!res.ok) throw new Error("Abruf fehlgeschlagen: " + url);
    return clean(res).then(function (r) { return cache.put(key, r); });
  });
}

// Schriften sind Beiwerk: Fehler hier dürfen die Installation nicht verhindern.
function cacheFonts(cache) {
  return fetch(FONT_CSS).then(function (res) {
    if (!res.ok) return;
    var copy = res.clone();
    return res.text().then(function (css) {
      var urls = [], re = /url\((https:[^)]+)\)/g, m;
      while ((m = re.exec(css))) urls.push(m[1]);
      return Promise.all(urls.map(function (u) {
        return fetch(u).then(function (r) { if (r.ok) return cache.put(u, r); }).catch(function () {});
      })).then(function () { return cache.put(FONT_CSS, copy); });
    });
  }).catch(function () {});
}

self.addEventListener("install", function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) {
    return Promise.all(CORE.map(function (f) { return putFresh(cache, f, f); }))
      .then(function () { return cacheFonts(cache); });
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) { if (k !== CACHE) return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function isFont(url) { return url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com"; }

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);

  // Die Seite selbst: sofort aus dem Speicher, im Hintergrund auf eine neuere Fassung prüfen.
  if (req.mode === "navigate" && url.origin === self.location.origin && /(\/|\/index\.html)$/.test(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(function (cache) {
      return cache.match("index.html").then(function (cached) {
        var update = fetch(req).then(function (res) {
          if (!res.ok) return res;
          return clean(res).then(function (r) { return cache.put("index.html", r.clone()).then(function () { return r; }); });
        });
        if (cached) { event.waitUntil(update.catch(function () {})); return cached; }
        return update;
      });
    }));
    return;
  }

  if (url.origin === self.location.origin || isFont(url)) {
    event.respondWith(caches.open(CACHE).then(function (cache) {
      return cache.match(req, { ignoreVary: true }).then(function (cached) {
        if (cached) return cached;
        return fetch(req).then(function (res) {
          if (res.ok && isFont(url)) cache.put(req, res.clone());
          return res;
        });
      });
    }));
  }
});
