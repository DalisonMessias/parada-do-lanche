self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', async (event) => {
  const data = event.data || {};
  if (data.type !== 'SHOW_NOTIFICATION') return;

  const title = data.title || 'Parada do Lanche';
  const body = data.body || '';
  const tag = data.tag || 'pl-general';

  await self.registration.showNotification(title, {
    body,
    tag,
    renotify: true,
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
      return undefined;
    })
  );
});
