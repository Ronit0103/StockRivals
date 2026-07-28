// ponytail: no offline caching — this is a realtime game, stale cached state
// would be worse than no cache. This SW exists only to make the app
// installable and to detect new deploys for the auto-refresh prompt.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {}); // required for installability
