figma.showUI(__html__);
figma.ui.resize(500, 600);

// Debounce reloads to avoid spam when both selection & property change fire together
let reloadTimer: number | undefined;

// Initial export
exportSelectionAndPost();

// --- Trigger reload when selection changes ---
figma.on('selectionchange', () => scheduleReload());

// --- Trigger reload when export settings changes ---
figma.on('documentchange', (event) => {
  for (const change of event.documentChanges) {
    if (
      change.type === 'PROPERTY_CHANGE' &&
      change.origin === 'LOCAL' &&
      change.properties.includes('exportSettings')
    ) {
      scheduleReload();
      break; // no need to loop further
    }
  }
});

// --- Manual reload from UI still supported ---
figma.ui.onmessage = async (msg: any) => {
  if (msg === '' || (msg && msg.type === 'reload')) {
    await exportSelectionAndPost();
  }
};

// Debounced reload
function scheduleReload() {
  if (reloadTimer) clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => exportSelectionAndPost(), 500) as unknown as number;
}

// --- Export logic (same as before) ---
async function exportSelectionAndPost() {
  const { selection } = figma.currentPage;

  if (!selection || selection.length === 0) {
    figma.ui.postMessage([]); // clear UI
    return;
  }

  const items = selection.filter((n): n is SceneNode => 'exportAsync' in n);
  if (items.length === 0) {
    figma.ui.postMessage([]);
    return;
  }

  const pending: Array<[string, number, Promise<Uint8Array>]> = [];

  for (const node of items) {
    const scale =
      (Array.isArray(node.exportSettings) &&
        node.exportSettings[0] &&
        // @ts-ignore
        node.exportSettings[0].constraint?.type === 'SCALE' &&
        // @ts-ignore
        Number(node.exportSettings[0].constraint?.value)) || 1;

    pending.push([node.name, scale, exportNodeAsPNG(node, scale)]);
  }

  const resolved = await Promise.all(
    pending.map(async ([name, scale, bytesP]) => [name, scale, await bytesP] as [string, number, Uint8Array])
  );

  figma.ui.postMessage(resolved);
}

async function exportNodeAsPNG(node: SceneNode, scale: number): Promise<Uint8Array> {
  const options: ExportSettings = {
    format: 'PNG',
    constraint: { type: 'SCALE', value: scale },
  };
  const bytes = await node.exportAsync(options);
  return new Uint8Array(bytes);
}
