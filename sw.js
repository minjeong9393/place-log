/* SCMJ 장소 서비스워커 — 앱 껍데기와 Leaflet 만 캐시해서 오프라인 실행·홈 화면 설치를 돕습니다.
 * 장소 기록은 브라우저 저장소(localStorage)와 남편과의 방(Firebase)에만 있고 여기에는 저장하지 않습니다.
 * 화면(HTML)·매니페스트는 네트워크 우선이라 새 버전이 바로 반영되고,
 * 지도 타일(OpenStreetMap)은 캐시하지 않고 그대로 네트워크로 보냅니다. */
var CACHE = 'place-log-v1';
var CDN = 'place-log-cdn-v1';
var ASSETS = ['./', './index.html', './manifest.json', './favicon.ico', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
      .catch(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE && k !== CDN; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function isHtml(req, url) {
  if (req.mode === 'navigate') return true;
  if (url.pathname === '/' || /\/$/.test(url.pathname)) return true;
  return /\/index\.html$/.test(url.pathname);
}
function isManifest(url) { return /\/manifest\.json$/.test(url.pathname); }
function isLeaflet(url) { return /(^|\.)unpkg\.com$/.test(url.hostname); }

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (err) { return; }

  /* 다른 곳에서 오는 요청 — Leaflet(CDN)만 캐시, 지도 타일·주소검색은 그대로 통과 */
  if (url.origin !== location.origin) {
    if (!isLeaflet(url)) return;
    e.respondWith(
      caches.open(CDN).then(function (c) {
        return c.match(req).then(function (hit) {
          if (hit) return hit;
          return fetch(req).then(function (res) {
            if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
            return res;
          });
        });
      }).catch(function () { return fetch(req); })
    );
    return;
  }

  if (isHtml(req, url) || isManifest(url)) {
    e.respondWith(
      fetch(req, { cache: 'no-store' }).then(function (res) {
        var copy = res.clone();
        var target = isHtml(req, url) ? './index.html' : './manifest.json';
        caches.open(CACHE).then(function (c) { c.put(target, copy); }).catch(function () { });
        return res;
      }).catch(function () {
        return caches.match(isHtml(req, url) ? './index.html' : './manifest.json')
          .then(function (hit) { return hit || caches.match(req); });
      })
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () { });
        }
        return res;
      });
    }).catch(function () { return caches.match(req); })
  );
});
