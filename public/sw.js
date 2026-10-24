/* Berlin Rent Hunter AI service worker: push notifications + offline fallback. No API caching. */
const CACHE = "brh-static-v1";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/icons/icon-192.png"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const TEXT = {
  fa: { NEW_ELIGIBLE: "آپارتمان مناسب جدید", HIGH_PRIORITY: "آپارتمان بسیار خوب جدید", APPLICATION_SENT: "درخواست ارسال شد", LANDLORD_REPLY: "پاسخ جدید صاحبخانه", VIEWING_INVITATION: "دعوت به بازدید", DOCUMENT_REQUEST: "درخواست مدارک", LISTING_UNAVAILABLE: "آگهی دیگر در دسترس نیست", INTEGRATION_FAILED: "خطای اتصال", JOB_FAILING: "خطای پس‌زمینه", SUSPICIOUS_MESSAGE: "پیام مشکوک" },
  de: { NEW_ELIGIBLE: "Neue passende Wohnung", HIGH_PRIORITY: "Sehr gute neue Wohnung", APPLICATION_SENT: "Bewerbung gesendet", LANDLORD_REPLY: "Neue Vermieter-Antwort", VIEWING_INVITATION: "Besichtigungseinladung", DOCUMENT_REQUEST: "Unterlagen angefordert", LISTING_UNAVAILABLE: "Anzeige nicht mehr verfügbar", INTEGRATION_FAILED: "Integrationsfehler", JOB_FAILING: "Hintergrundfehler", SUSPICIOUS_MESSAGE: "Verdächtige Nachricht" },
};

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {}
  const lang = (self.navigator && self.navigator.language || "fa").startsWith("de") ? "de" : "fa";
  const title = (TEXT[lang] && TEXT[lang][data.category]) || "Berlin Rent Hunter AI";
  const p = data.payload || {};
  const body = [p.title, p.subject, p.when, p.warm ? `${p.warm} € warm` : null].filter(Boolean).join(" · ");
  event.waitUntil(self.registration.showNotification(title, { body, tag: data.id, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", data: { link: data.link || "/" }, dir: lang === "fa" ? "rtl" : "ltr", lang }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if ("focus" in c) { c.navigate(link); return c.focus(); }
      return self.clients.openWindow(link);
    }),
  );
});
