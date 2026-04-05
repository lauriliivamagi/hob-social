import '../ui/recipe/recipe-page.js';
import { registerSW } from 'virtual:pwa-register';

// Recipe data is injected by the Vite plugin into the HTML as script globals
// Components read from window.RECIPE, window.SCHEDULE_RELAXED, etc.

registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (registration) {
      setInterval(() => { registration.update(); }, 60 * 60 * 1000);
    }
  },
});
