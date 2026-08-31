// Minimal service worker — its only real job is to exist, which is what
// makes Chrome/Edge treat this site as an installable PWA. It doesn't need
// to cache anything for the app to work correctly, since every page here
// already requires a live network connection to Supabase to function.
self.addEventListener('install', function(event){
  self.skipWaiting();
});

self.addEventListener('activate', function(event){
  event.waitUntil(self.clients.claim());
});

// Pass every request straight through to the network — no offline caching,
// since this app is fundamentally online-only (Supabase-backed).
self.addEventListener('fetch', function(event){
  event.respondWith(fetch(event.request));
});

// JD Manual integration v1.0: jd-manual.html intentionally follows existing network-first/no-sensitive-cache behaviour.
