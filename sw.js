const CACHE = "casa-family-v18";
const APP_SHELL = ["./?v=18","./index.html?v=18","./styles.css?v=18","./app.js?v=18","./manifest.json?v=18","./icons/icon-192.png","./icons/icon-512.png"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const isSameOrigin = new URL(event.request.url).origin === self.location.origin;
  if (event.request.mode === "navigate" || (isSameOrigin && ["script","style","document"].includes(event.request.destination))) {
    event.respondWith(
      fetch(new Request(event.request,{cache:"reload"}))
        .catch(() => caches.match(event.request))
        .then(r => r || caches.match("./index.html?v=18") || caches.match("./?v=18"))
    );
    return;
  }
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
self.addEventListener("push", event => {
  let data = {title:"CASA", body:"C'è una novità in famiglia.", url:"./"};
  try { data = {...data, ...event.data.json()}; } catch {}
  event.waitUntil(self.registration.showNotification(data.title, {
    body:data.body,
    icon:"./icons/icon-192.png",
    badge:"./icons/icon-192.png",
    tag:data.tag || "casa-update",
    data:{url:data.url || "./"},
    vibrate:[100,50,100]
  }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "./", self.registration.scope).href;
  event.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(wins => {
    for (const c of wins) { if ("focus" in c) { c.navigate(url); return c.focus(); } }
    return clients.openWindow(url);
  }));
});
