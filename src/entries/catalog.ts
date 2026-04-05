import '../ui/catalog/catalog-page.js';
import { registerSW } from 'virtual:pwa-register';

registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (registration) {
      // Check for updates hourly (for kitchen tablets that stay open)
      setInterval(() => { registration.update(); }, 60 * 60 * 1000);
    }
  },
});
