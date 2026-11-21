// Plugin sandbox: reads the selection and exports PNGs for the UI on request.

import { resolveSuffix, constraintLabel } from './shared/filenames';
import type { LayerInfo, ToCode, ToUi } from './shared/messages';
import { sanitizeSettings } from './shared/settings';

const SETTINGS_KEY = 'settings';

figma.showUI(__html__, { width: 500, height: 600 });

function post(msg: ToUi) {
  figma.ui.postMessage(msg);
}

// --- Reload when the selection or a selected layer's export settings change ---

let reloadTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleReload() {
  if (reloadTimer) clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => postSelection(), 500);
}

figma.on('selectionchange', scheduleReload);

// With "documentAccess": "dynamic-page", figma.on('documentchange') would force the
// whole file to load. Watching only the current page avoids that.
function onNodeChange(event: NodeChangeEvent) {
  const selected = new Set(figma.currentPage.selection.map((n) => n.id));
  for (const change of event.nodeChanges) {
    if (change.type === 'PROPERTY_CHANGE' && change.properties.includes('exportSettings') && selected.has(change.node.id)) {
      scheduleReload();
      return;
    }
  }
}
let watchedPage: PageNode = figma.currentPage;
watchedPage.on('nodechange', onNodeChange);
figma.on('currentpagechange', () => {
  watchedPage.off('nodechange', onNodeChange);
  watchedPage = figma.currentPage;
  watchedPage.on('nodechange', onNodeChange);
  scheduleReload();
});

figma.ui.onmessage = async (msg: ToCode) => {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'reload') {
    postSelection();
  } else if (msg.type === 'export') {
    await exportLayers(msg.exportId, msg.ids);
  } else if (msg.type === 'cancel-export') {
    activeExport = 0;
  } else if (msg.type === 'save-settings') {
    try {
      await figma.clientStorage.setAsync(SETTINGS_KEY, sanitizeSettings(msg.settings));
    } catch (_) {
      // Settings are a convenience; ignore storage errors.
    }
  }
};

// Send saved settings first so the UI applies them before the first compression.
(async () => {
  let saved: unknown = null;
  try {
    saved = await figma.clientStorage.getAsync(SETTINGS_KEY);
  } catch (_) {}
  post({ type: 'init', settings: sanitizeSettings(saved) });
  postSelection();
})();

// --- Export ---

function exportScale(node: SceneNode): number {
  const s = node.exportSettings && node.exportSettings[0];
  if (s && 'constraint' in s && s.constraint && s.constraint.type === 'SCALE') {
    const v = Number(s.constraint.value);
    if (v > 0) return v;
  }
  return 1;
}

function explicitSuffix(node: SceneNode): string {
  const s = node.exportSettings && node.exportSettings[0];
  return (s && 'suffix' in s && s.suffix) || '';
}

// Layers from the last selection sent to the UI, by id.
let layers = new Map<string, SceneNode>();
// The export run the UI currently wants; 0 when cancelled.
let activeExport = 0;
const EXPORT_BATCH = 4;

function postSelection() {
  activeExport = 0; // a new selection replaces any export in progress
  const nodes = figma.currentPage.selection.filter((n): n is SceneNode => 'exportAsync' in n);
  layers = new Map(nodes.map((n) => [n.id, n]));
  const info: LayerInfo[] = nodes.map((node) => {
    const scale = exportScale(node);
    return {
      id: node.id,
      name: node.name,
      label: constraintLabel('SCALE', scale),
      suffix: resolveSuffix('SCALE', scale, explicitSuffix(node)),
    };
  });
  post({ type: 'selection', layers: info });
}

/** Exports the requested layers a few at a time, so huge selections don't all export at once. */
async function exportLayers(exportId: number, ids: string[]) {
  activeExport = exportId;
  for (let i = 0; i < ids.length; i += EXPORT_BATCH) {
    if (activeExport !== exportId) return; // cancelled or replaced
    await Promise.all(
      ids.slice(i, i + EXPORT_BATCH).map(async (id) => {
        const node = layers.get(id);
        try {
          if (!node || node.removed) throw new Error('Layer no longer exists');
          const scale = exportScale(node);
          const bytes = await node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: scale } });
          if (activeExport === exportId) post({ type: 'exported', exportId, id, bytes });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (activeExport === exportId) post({ type: 'export-failed', exportId, id, message });
        }
      }),
    );
  }
  if (activeExport === exportId) post({ type: 'export-finished', exportId });
}
