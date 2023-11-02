importScripts("demuxer_mp4.js", "renderer_2d.js");

// Status UI. Messages are batched per animation frame.
let pendingStatus = null;

function setStatus(type, message) {
  if (pendingStatus) {
    pendingStatus[type] = message;
  } else {
    pendingStatus = { [type]: message };
    self.requestAnimationFrame(statusAnimationFrame);
  }
}

function statusAnimationFrame() {
  self.postMessage(pendingStatus);
  pendingStatus = null;
}

// Rendering. Drawing is limited to once per animation frame.
let renderer = null;
let pendingFrame = null;
let startTime = null;
let frameCount = 0;

function renderFrame(frame) {
  if (!pendingFrame) {
    // Schedule rendering in the next animation frame.
    requestAnimationFrame(renderAnimationFrame);
  } else {
    // Close the current pending frame before replacing it.
    pendingFrame.close();
  }
  // Set or replace the pending frame.
  pendingFrame = frame;
}

function renderAnimationFrame() {
  renderer.draw(pendingFrame);
  pendingFrame = null;
}

// Startup.
function start({ dataUri, rendererName, canvas }) {
  // Pick a renderer to use.
  switch (rendererName) {
    case "2d":
      renderer = new Canvas2DRenderer(canvas);
      break;
  }

  // Set up a VideoDecoer.
  const decoder = new VideoDecoder({
    output(frame) {
      //get yuv from frame
      let displayWidth = frame.displayWidth;
      let displayHeight = frame.displayHeight;
      let yuvLength = displayWidth * displayHeight * 3 / 2;
      let yuvFrameBuffer = new Uint8Array(yuvLength);
      let yuvType = frame.format;
      const options = {
        format: frame.format,
        colorSpace: 'display-p3',
        sourceRect: { x: 0, y: 0, width: displayWidth, height: displayHeight },
        destinationOffset: { x: 0, y: 0 }
      }
      frame.copyTo(yuvFrameBuffer, options).then(() => {
        console.log("frame copy success yuvLength:" + yuvLength);
      }).catch(() => {
        console.log("frame copyTo error");
      });
      //get yuv from frame end


      // Update statistics.
      if (startTime == null) {
        startTime = performance.now();
      } else {
        const elapsed = (performance.now() - startTime) / 1000;
        const fps = ++frameCount / elapsed;
        setStatus("render", `${fps.toFixed(0)} fps`);
      }

      // Schedule the frame to be rendered.
      renderFrame(frame);
    },
    error(e) {
      setStatus("decode", e);
    }
  });

  // Fetch and demux the media data.
  const demuxer = new MP4Demuxer(dataUri, {
    onConfig(config) {
      setStatus("decode", `${config.codec} @ ${config.codedWidth}x${config.codedHeight}`);
      decoder.configure(config);
    },
    onChunk(chunk) {
      decoder.decode(chunk);
    },
    setStatus
  });
}

// Listen for the start request.
self.addEventListener("message", message => start(message.data), { once: true });
