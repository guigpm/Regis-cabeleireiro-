// No caching of authenticated pages or customer data. Used only for local reminders.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((windows) => {
      const panel = windows.find((window) => new URL(window.url).pathname.startsWith('/painel'));
      return panel ? panel.focus() : clients.openWindow('/painel');
    })
  );
});
