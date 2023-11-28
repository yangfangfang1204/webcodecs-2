importScripts("demuxer_mp4.js", "renderer_webgl.js", "renderer_2d.js");

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
let videoEncoder = null;
frameCounter = 0;

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
  //init videoEncoder
  if (videoEncoder == null) {
    const initParam = {
      output: (frame, meta) => {
        //h264/vp9 raw data , muxer...
        let frameData = new Uint8Array(frame.byteLength);
        frame.copyTo(frameData);
        console.log("get frameData");
      },
      error: () => {
        console.log("encoder error");
      }
    }
    videoEncoder = new VideoEncoder(initParam);
    videoEncoder.configure({
      codec: "vp09.00.10.08",
      width: 1920,
      height: 1080,
      bitrate: 10e6,
    });
  }
  //inputdata to videoEncoder
  // let pixelData = renderer.getRGBAData();//copy rgba data from webgl
  let pixelData = renderer.getWebGLTexture(); //get webgltexture
  const videoFrame = new VideoFrame(pixelData.data, {
    timestamp: performance.now() * 1000,
    codedWidth: pixelData.width,
    codedHeight: pixelData.height,
    format: 'RGBA'
  });
  const insert_keyframe = (frameCounter % 50) === 0;
  videoEncoder.encode(videoFrame, { keyFrame: insert_keyframe });
  videoFrame.close();
  pendingFrame = null;
}

// Startup.
function start({ dataUri, rendererName, canvas }) {
  // Pick a renderer to use.
  switch (rendererName) {
    case "2d":
      renderer = new Canvas2DRenderer(canvas);
      break;
    case "webgl":
      renderer = new WebGLRenderer(rendererName, canvas);
      break;
  }

  // Set up a VideoDecoer.
  const decoder = new VideoDecoder({
    output(frame) {
      //get yuv from frame
      let displayWidth = frame.displayWidth;
      let displayHeight = frame.displayHeight;
      let yuvLength = displayWidth * displayHeight * 3 / 2;
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
