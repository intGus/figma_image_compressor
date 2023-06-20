figma.showUI(__html__)

figma.ui.resize(500, 600)

main()

async function main() {
  const blobs = [];
  const { selection } = figma.currentPage;

  for (let node of selection) {
    const scale = node.exportSettings[0].constraint.value || 1;
    const blobPromise = exportPostNodeAsJPG(node, scale);
    blobs.push([node.name, scale, blobPromise]);
  }

  const resolvedBlobs = await Promise.all(
    blobs.map(async ([nodeName, scale, blobPromise]) => [nodeName, scale, await blobPromise])
  );
  figma.ui.postMessage(resolvedBlobs);

  async function exportFrameAsJPG(frameNode, scale) {
    const options = {
      format: 'JPG',
      constraint: {
        type: 'SCALE',
        value: scale // Get the value from Figma's export setting
      }
    };

    const bytes = await frameNode.exportAsync(options);
    return new Uint8Array(bytes);
  }

  async function exportPostNodeAsJPG(node, scale) {
    const postFrame = node;

    if (!postFrame) {
      return;
    }

    try {
      const imageBytes = await exportFrameAsJPG(postFrame, scale);
      return imageBytes;
    } catch (error) {
      console.error('Error exporting frame as JPG:', error);
      throw error; // Rethrow the error to propagate it
    }
  }
};