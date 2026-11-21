// Plugin sandbox: reads the selection, exports PNGs and sends them to the UI.

import { resolveSuffix, constraintLabel } from './shared/filenames';
import type { ExportedItem, ToCode, ToUi } from './shared/messages';
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
  reloadTimer = setTimeout(() => exportSelectionAndPost(), 500);
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
    await exportSelectionAndPost();
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
  await exportSelectionAndPost();
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

async function exportSelectionAndPost() {
  const nodes = figma.currentPage.selection.filter((n): n is SceneNode => 'exportAsync' in n);
  if (nodes.length === 0) {
    post({ type: 'selection', items: [] });
    return;
  }
  const items: ExportedItem[] = await Promise.all(
    nodes.map(async (node) => {
      const scale = exportScale(node);
      const bytes = await node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: scale } });
      return {
        id: node.id,
        name: node.name,
        label: constraintLabel('SCALE', scale),
        suffix: resolveSuffix('SCALE', scale, explicitSuffix(node)),
        bytes,
      };
    }),
  );
  post({ type: 'selection', items });
}
