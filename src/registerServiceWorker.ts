export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) =>
        Promise.all(registrations.map((registration) => registration.unregister())),
      )
      .catch(() => {})

    if ('caches' in window) {
      window.caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((key) => key.startsWith('trinity-internal-tool'))
              .map((key) => window.caches.delete(key)),
          ),
        )
        .catch(() => {})
    }
  })
}
