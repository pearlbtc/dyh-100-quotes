/* 董宇辉最经典语录100句 · 阅读小工具 — Service Worker 离线缓存 */
const CACHE = "dyh100-v3";  // 每次发布 +1，确保用户立刻拿到新缓存
const CORE = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "data.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "assets/cover.jpg",
  "assets/vol1.jpg", "assets/vol2.jpg", "assets/vol3.jpg",
  "assets/vol4.jpg", "assets/vol5.jpg", "assets/vol6.jpg",
  "assets/vol7.jpg", "assets/vol8.jpg", "assets/vol9.jpg"
];

self.addEventListener("message", function (e) {
  if (e.data === "skipWaiting") self.skipWaiting();
});

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(CORE); }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) {
        return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);

  // 音频彻底不进 SW：流式播放需要 HTTP Range，拦截后 Chromium 会中止请求（gotchas 坑1）
  if (url.pathname.endsWith(".mp3")) return;

  // JS/CSS/HTML：网络优先（确保用户永远拿到最新代码）；网络失败才回退缓存
  var isCode = url.pathname.endsWith(".js") || url.pathname.endsWith(".css") ||
               url.pathname.endsWith(".html") || url.pathname === "/" || url.pathname.endsWith("/");
  if (isCode) {
    e.respondWith(
      fetch(req).then(function (res) {
        if (res && res.ok && url.origin === self.location.origin) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || caches.match("index.html");
        });
      })
    );
    return;
  }

  // 图片等其余资源：缓存优先；未命中则走网络并回填
  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.ok && url.origin === self.location.origin) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return caches.match("index.html"); });
    })
  );
});
