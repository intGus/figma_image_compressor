// code.ts

figma.showUI(__html__);
figma.ui.resize(500, 600);

main();

// Re-export current selection and send fresh bytes to the UI
async function main() {
  const { selection } = figma.currentPage;

  if (!selection || selection.length === 0) {
    figma.notify('Select at least one exportable node.');
    // Still send an empty array so the UI clears if needed
    figma.ui.postMessage([]);
    return;
  }

  // Build: [name, scale, Uint8ArrayPromise]
  const pending: Array<[string, number, Promise<Uint8Array>]> = [];

  for (const node of selection) {
    if (!('exportAsync' in node)) continue;

    // If the node has an explicit export setting with a SCALE, use it; else default to 1
    const scale =
      (Array.isArray(node.exportSettings) &&
        node.exportSettings[0] &&
        // @ts-ignore – Figma types for exportSettings can vary
        node.exportSettings[0].constraint?.type === 'SCALE' &&
        // @ts-ignore
        Number(node.exportSettings[0].constraint?.value)) ||
      1;

    pending.push([node.name, scale, exportNodeAsPNG(node, scale)]);
  }

  // Resolve all exports
  const resolved = await Promise.all(
    pending.map(async ([name, scale, bytesP]) => [name, scale, await bytesP] as [string, number, Uint8Array])
  );

  // Send to UI in the exact shape your previous ui.html expects: [[name, scale, Uint8Array], ...]
  figma.ui.postMessage(resolved);
}

// Export helper (PNG = lossless input for the UI’s encoders)
async function exportNodeAsPNG(node: SceneNode, scale: number): Promise<Uint8Array> {
  const options: ExportSettingsPNG = {
    format: 'PNG',
    constraint: { type: 'SCALE', value: scale },
  };
  const bytes = await node.exportAsync(options);
  return new Uint8Array(bytes);
}

// Handle simple "reload" ping from the UI (your previous file sent an empty pluginMessage on Reload)
figma.ui.onmessage = async (msg: any) => {
  // Your previous UI used: parent.postMessage({ pluginMessage: '' }, '*')
  // Treat empty string or {type:'reload'} as a reload request
  if (msg === '' || (msg && msg.type === 'reload')) {
    await main();
  }
};
