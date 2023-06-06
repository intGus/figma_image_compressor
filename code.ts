figma.showUI(__html__)

figma.ui.resize(500, 500)

figma.ui.onmessage = async (pluginMessage) => {
  // test
  const { selection } = figma.currentPage
  console.log(selection[0].height)
  exportPostFrameAsPNG();

  async function exportFrameAsPNG(frameNode) {
    const options = {
      format: 'JPG',
      constraint: {
        type: 'SCALE',
        value: 1 // Adjust the value as needed for the desired scale
      }
    };

    const imageBytes = await frameNode.exportAsync(options);
    //
    // console.log(imageBytes)
    // return
    //
    return imageBytes;
  }

  function findPostFrame() {
    const postFrame = figma.currentPage.findOne(node => node.name === 'Post' && node.type === 'FRAME');

    if (!postFrame) {
      console.error('Post frame not found');
      return null;
    }

    return postFrame;
  }

  async function exportPostFrameAsPNG() {
    const postFrame = selection[0];

    if (!postFrame) {
      return;
    }

    try {
      const imageBytes = await exportFrameAsPNG(postFrame);
      // const imageURL = figma.createImage(imageBytes).hash;
      figma.ui.postMessage({ type: 'pngData', imageBytes })
    } catch (error) {
      console.error('Error exporting frame as PNG:', error);
    }
  }
}