/**
 * Background service worker — message router + XState import machine.
 *
 * The import pipeline is managed by importMachine (XState v5).
 * State snapshots are persisted to chrome.storage.local so the popup
 * can display status across open/close cycles.
 */

import { createActor } from 'xstate';
import { importMachine, type ImportContext, type ImportPhase } from './import-machine.js';
import { getSettings, saveSettings } from './settings.js';
import { getAllRecipes, getRecipe, deleteRecipe, saveAtprotoRkey } from './recipe-store.js';
import type { ServiceWorkerMessage, ImportStatus } from '../shared/messages.js';

// ---------------------------------------------------------------------------
// Import machine actor — single instance for the service worker lifetime
// ---------------------------------------------------------------------------

const importActor = createActor(importMachine);

// Broadcast + persist status on every state transition
importActor.subscribe((snapshot) => {
  const status = snapshotToStatus(snapshot.value as string, snapshot.context);
  chrome.storage.local.set({ lastImportStatus: status });
  chrome.runtime.sendMessage(status).catch(() => {
    // Popup may not be open — ignore
  });
});

importActor.start();

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message: ServiceWorkerMessage, _sender, sendResponse) => {
  handleMessage(message)
    .then(sendResponse)
    .catch((err) => sendResponse({ type: 'STATUS', phase: 'error', message: String(err) }));
  return true;
});

async function handleMessage(message: ServiceWorkerMessage): Promise<unknown> {
  switch (message.type) {
    case 'IMPORT_RECIPE': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        return { type: 'STATUS', phase: 'error', message: 'No active tab found' } satisfies ImportStatus;
      }
      importActor.send({ type: 'IMPORT', tabId: tab.id });
      // Return current status immediately — updates come via onMessage
      return snapshotToStatus(
        importActor.getSnapshot().value as string,
        importActor.getSnapshot().context,
      );
    }
    case 'LIST_RECIPES':
      return { type: 'LIST_RECIPES_RESULT', recipes: await getAllRecipes() };
    case 'DELETE_RECIPE':
      await deleteRecipe(message.slug);
      return { success: true };
    case 'EXPORT_RECIPE': {
      const recipe = await getRecipe(message.slug);
      if (!recipe) return { error: 'Not found' };
      const json = JSON.stringify(toInputFormat(recipe.recipe), null, 2);
      const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);
      await chrome.downloads.download({
        url: dataUrl,
        filename: `${message.slug}.json`,
        saveAs: true,
      });
      return { success: true };
    }
    case 'GET_SETTINGS':
      return { type: 'SETTINGS_RESULT', settings: await getSettings() };
    case 'SAVE_SETTINGS':
      await saveSettings(message.settings);
      return { success: true };
    case 'SAVE_ATPROTO_RKEY':
      await saveAtprotoRkey(message.slug, message.rkey);
      return { success: true };
    case 'GET_LAST_STATUS': {
      const snapshot = importActor.getSnapshot();
      const stateValue = snapshot.value as string;
      // If machine is in a transient working state but the actor is actually
      // idle (service worker restarted), the machine re-initializes to 'idle'
      // automatically — no stale state possible.
      return snapshotToStatus(stateValue, snapshot.context);
    }
  }
}

// ---------------------------------------------------------------------------
// Export: reverse Zod transforms to produce the JSON input format
// ---------------------------------------------------------------------------

/**
 * The Zod schema transforms flat {quantity, unit} → {quantity: {amount, unit}}.
 * Export must reverse this so the JSON can be fed back through the build pipeline
 * (parseRecipe, vite-plugin-recipes, etc.).
 */
function toInputFormat(recipe: unknown): unknown {
  const r = JSON.parse(JSON.stringify(recipe)) as Record<string, unknown>;
  const ingredients = r['ingredients'] as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(ingredients)) {
    for (const ing of ingredients) {
      const q = ing['quantity'];
      if (q && typeof q === 'object' && !Array.isArray(q)) {
        const qObj = q as Record<string, unknown>;
        if ('amount' in qObj && 'unit' in qObj) {
          ing['quantity'] = qObj['amount'];
          ing['unit'] = qObj['unit'];
        }
      }
    }
  }
  return r;
}

// ---------------------------------------------------------------------------
// Map machine state → popup status
// ---------------------------------------------------------------------------

function snapshotToStatus(stateValue: string, context: ImportContext): ImportStatus {
  switch (stateValue as ImportPhase | 'loadingSettings') {
    case 'idle':
      // If there's a previous result, show it
      if (context.resultSlug && context.resultTitle) {
        return { type: 'STATUS', phase: 'done', slug: context.resultSlug, title: context.resultTitle };
      }
      if (context.errorMessage) {
        return { type: 'STATUS', phase: 'error', message: context.errorMessage };
      }
      return { type: 'STATUS', phase: 'idle' };
    case 'loadingSettings':
    case 'extracting':
      return { type: 'STATUS', phase: 'extracting' };
    case 'parsing':
      return { type: 'STATUS', phase: 'parsing', attempt: context.attempt };
    case 'done':
      return { type: 'STATUS', phase: 'done', slug: context.resultSlug!, title: context.resultTitle! };
    case 'error':
      return { type: 'STATUS', phase: 'error', message: context.errorMessage ?? 'Unknown error' };
    default:
      return { type: 'STATUS', phase: 'idle' };
  }
}
