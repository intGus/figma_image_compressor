figma.showUI(__html__)

figma.ui.resize(500, 500)

main()

async function main() {
  const blobs = [];
  const { selection } = figma.currentPage;

  for (let node of selection) {
    const blobPromise = exportPostNodeAsJPG(node);
    blobs.push([node.name, blobPromise]);
    // blobs.push(blobPromise)
    console.log(node.name, blobPromise);
  }

  const resolvedBlobs = await Promise.all(
    blobs.map(async ([nodeName, blobPromise]) => [nodeName, await blobPromise])
  );
  console.log(resolvedBlobs);
  figma.ui.postMessage(resolvedBlobs);

  async function exportFrameAsPNG(frameNode) {
    const options = {
      format: 'JPG',
      constraint: {
        type: 'SCALE',
        value: 2 // Adjust the value as needed for the desired scale
      }
    };

    const bytes = await frameNode.exportAsync(options);
    return new Uint8Array(bytes);
  }

  async function exportPostNodeAsJPG(node) {
    const postFrame = node;

    if (!postFrame) {
      return;
    }

    try {
      const imageBytes = await exportFrameAsPNG(postFrame);
      return imageBytes;
    } catch (error) {
      console.error('Error exporting frame as PNG:', error);
      throw error; // Rethrow the error to propagate it
    }
  }
};