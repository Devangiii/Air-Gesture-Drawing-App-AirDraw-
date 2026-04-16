import { BRUSH_SIZES, COLORS, GESTURE_META } from '../config/airDrawConstants';
import { ensureMediaPipeLoaded } from './mediapipeLoader';

export function initAirDraw() {
  const state = {
    color: '#7c3aed',
    size: 5,
    opacity: 1,
    tool: 'draw',
    isDrawing: false,
    prevX: null,
    prevY: null,
    strokes: [],
    currentStroke: null,
    smoothX: null,
    smoothY: null,
  };

  const elements = {
    videoEl: document.getElementById('videoEl'),
    drawingCanvas: document.getElementById('drawingCanvas'),
    webcamSmall: document.getElementById('webcamSmall'),
    cursorDot: document.getElementById('cursorDot'),
    gestureHud: document.getElementById('gestureHud'),
    gestureIcon: document.getElementById('gestureIcon'),
    gestureName: document.getElementById('gestureName'),
    statusPill: document.getElementById('statusPill'),
    statusDot: document.getElementById('statusDot'),
    statusText: document.getElementById('statusText'),
    onboarding: document.getElementById('onboarding'),
    loadingRow: document.getElementById('loadingRow'),
    loadingMsg: document.getElementById('loadingMsg'),
    canvasArea: document.getElementById('canvasArea'),
    startBtn: document.getElementById('startBtn'),
    colorPalette: document.getElementById('colorPalette'),
    sizePicker: document.getElementById('sizePicker'),
    opacitySlider: document.getElementById('opacitySlider'),
    btnDraw: document.getElementById('btnDraw'),
    btnErase: document.getElementById('btnErase'),
    btnClear: document.getElementById('btnClear'),
    btnSave: document.getElementById('btnSave'),
    toast: document.getElementById('toast'),
  };

  const missingElements = Object.entries(elements)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missingElements.length > 0) {
    console.error('AirDraw init aborted. Missing DOM elements:', missingElements);
    return () => {};
  }

  const drawingContext = elements.drawingCanvas.getContext('2d');
  const webcamContext = elements.webcamSmall.getContext('2d');
  const cursorContext = elements.cursorDot.getContext('2d');

  if (!drawingContext || !webcamContext || !cursorContext) {
    console.error('AirDraw init aborted. Failed to create one or more canvas contexts.');
    return () => {};
  }

  let handsInstance = null;
  let cameraInstance = null;
  let mediaStream = null;
  let isStarting = false;
  let isStopping = false;
  let isDisposed = false;
  let mouseDown = false;
  let hudTimeoutId;
  let toastTimeoutId;
  let lastGesture = null;

  const cleanups = [];
  const toolButtonBaseClass = 'tool-btn flex h-9 w-11 items-center justify-center rounded-xl border border-[#1e1e2e] bg-transparent px-2 font-mono text-[0.68rem] tracking-[0.02em] text-slate-500 transition-all duration-200';
  const toolButtonActiveClass = 'border-violet-500 bg-violet-500/20 text-violet-400 shadow-[0_0_12px_rgba(124,58,237,0.2)]';
  const toolButtonIdleClass = 'hover:border-white/15 hover:bg-white/5 hover:text-slate-200';
  const toolButtonDangerIdleClass = 'hover:border-red-500 hover:bg-red-500/15 hover:text-red-500';
  const statusPillBaseClass = 'flex cursor-pointer items-center gap-1.5 rounded-full border bg-[#111118] px-3 py-1.5 font-mono text-[0.7rem] transition-all duration-300';
  const statusDotBaseClass = 'h-[7px] w-[7px] rounded-full transition-all duration-300';
  const swatchBaseClass = 'color-swatch h-9 w-9 flex-shrink-0 rounded-[10px] border-2 border-transparent transition-all duration-200 hover:scale-110';
  const swatchActiveClass = 'scale-110 border-white shadow-[0_0_0_1px_rgba(255,255,255,0.3),0_4px_12px_rgba(0,0,0,0.4)]';
  const sizeOptionBaseClass = 'size-option rounded-full bg-slate-500 transition-all duration-200 hover:bg-white';
  const sizeOptionActiveClass = 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.4)]';

  const addListener = (target, eventName, handler, options) => {
    target.addEventListener(eventName, handler, options);
    cleanups.push(() => target.removeEventListener(eventName, handler, options));
  };

  function setToolButtonState(button, { isActive = false, isDanger = false } = {}) {
    const idleClass = isDanger ? toolButtonDangerIdleClass : toolButtonIdleClass;
    button.className = `${toolButtonBaseClass} ${isActive ? toolButtonActiveClass : idleClass}`;
  }

  function updateToolUi() {
    setToolButtonState(elements.btnDraw, { isActive: state.tool === 'draw' });
    setToolButtonState(elements.btnErase, { isActive: state.tool === 'erase' });
    setToolButtonState(elements.btnClear, { isDanger: true });
    setToolButtonState(elements.btnSave);
  }

  function updateStatus(type, text) {
    let pillStateClass = 'border-[#1e1e2e] text-slate-500';
    let dotStateClass = 'bg-slate-500';

    if (type === 'active') {
      pillStateClass = 'border-emerald-500/30 text-emerald-500';
      dotStateClass = 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.9)]';
    } else if (type === 'detecting') {
      pillStateClass = 'border-amber-500/30 text-amber-400';
      dotStateClass = 'bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.9)] animate-pulse';
    }

    elements.statusPill.className = `${statusPillBaseClass} ${pillStateClass}`;
    elements.statusDot.className = `${statusDotBaseClass} ${dotStateClass}`;
    elements.statusText.textContent = text;
  }

  function setStartUiLoading(isLoading, message = '') {
    elements.startBtn.disabled = isLoading;
    elements.startBtn.classList.toggle('hidden', isLoading);
    elements.loadingRow.classList.toggle('hidden', !isLoading);
    elements.loadingRow.classList.toggle('flex', isLoading);
    if (message) {
      elements.loadingMsg.textContent = message;
    }
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.remove('translate-y-24');
    elements.toast.classList.add('translate-y-0');
    clearTimeout(toastTimeoutId);
    toastTimeoutId = setTimeout(() => {
      elements.toast.classList.remove('translate-y-0');
      elements.toast.classList.add('translate-y-24');
    }, 2200);
  }

  function showGestureHud(gesture) {
    const gestureInfo = GESTURE_META[gesture];
    if (!gestureInfo) {
      return;
    }

    elements.gestureIcon.textContent = gestureInfo.icon;
    elements.gestureName.textContent = gestureInfo.label;
    elements.gestureHud.classList.remove('opacity-0');
    elements.gestureHud.classList.add('opacity-100');

    clearTimeout(hudTimeoutId);
    hudTimeoutId = setTimeout(() => {
      elements.gestureHud.classList.remove('opacity-100');
      elements.gestureHud.classList.add('opacity-0');
    }, 1500);
  }

  function drawLine(x1, y1, x2, y2, color, size, opacity, tool) {
    drawingContext.save();
    drawingContext.globalAlpha = opacity;
    drawingContext.lineCap = 'round';
    drawingContext.lineJoin = 'round';

    if (tool === 'erase') {
      drawingContext.globalCompositeOperation = 'destination-out';
      drawingContext.strokeStyle = 'rgba(0,0,0,1)';
      drawingContext.lineWidth = size * 3;
    } else {
      drawingContext.globalCompositeOperation = 'source-over';
      drawingContext.strokeStyle = color;
      drawingContext.lineWidth = size;
    }

    drawingContext.beginPath();
    drawingContext.moveTo(x1, y1);
    drawingContext.lineTo(x2, y2);
    drawingContext.stroke();
    drawingContext.restore();
  }

  function redrawStrokes() {
    drawingContext.clearRect(0, 0, elements.drawingCanvas.width, elements.drawingCanvas.height);

    for (const stroke of state.strokes) {
      for (let i = 1; i < stroke.points.length; i += 1) {
        drawLine(
          stroke.points[i - 1].x,
          stroke.points[i - 1].y,
          stroke.points[i].x,
          stroke.points[i].y,
          stroke.color,
          stroke.size,
          stroke.opacity,
          stroke.tool,
        );
      }
    }
  }

  function clearDrawingState() {
    state.prevX = null;
    state.prevY = null;
    state.isDrawing = false;
    state.currentStroke = null;
    state.smoothX = null;
    state.smoothY = null;
    elements.cursorDot.style.display = 'none';
  }

  function clearCanvas() {
    drawingContext.clearRect(0, 0, elements.drawingCanvas.width, elements.drawingCanvas.height);
    state.strokes = [];
    state.currentStroke = null;
    showToast('Canvas cleared');
  }

  function saveCanvas() {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = elements.drawingCanvas.width;
    tempCanvas.height = elements.drawingCanvas.height;
    const tempContext = tempCanvas.getContext('2d');

    if (!tempContext) {
      showToast('Unable to save image right now.');
      return;
    }

    tempContext.fillStyle = '#080810';
    tempContext.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    tempContext.drawImage(elements.drawingCanvas, 0, 0);

    const downloadLink = document.createElement('a');
    downloadLink.download = `airdraw-${Date.now()}.png`;
    downloadLink.href = tempCanvas.toDataURL();
    downloadLink.click();

    showToast('Image saved');
  }

  function resizeCanvas() {
    const { width, height } = elements.canvasArea.getBoundingClientRect();
    const nextWidth = Math.max(1, Math.floor(width));
    const nextHeight = Math.max(1, Math.floor(height));

    if (elements.drawingCanvas.width === nextWidth && elements.drawingCanvas.height === nextHeight) {
      return;
    }

    elements.drawingCanvas.width = nextWidth;
    elements.drawingCanvas.height = nextHeight;
    redrawStrokes();
  }

  function isFingerUp(landmarks, fingerIndex) {
    const tipIndices = [4, 8, 12, 16, 20];
    const pipIndices = [3, 6, 10, 14, 18];

    if (fingerIndex === 0) {
      // Thumb: check if tip is to the right of pip (more robust)
      return landmarks[4].x > landmarks[3].x;
    }

    // For other fingers: tip should be significantly above pip
    return landmarks[tipIndices[fingerIndex]].y < landmarks[pipIndices[fingerIndex]].y - 0.02;  
  }

  function detectGesture(landmarks) {
    const indexFinger = isFingerUp(landmarks, 1);
    const middleFinger = isFingerUp(landmarks, 2);
    const ringFinger = isFingerUp(landmarks, 3);
    const pinkyFinger = isFingerUp(landmarks, 4);

    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const thumbPip = landmarks[3];
    
    // More robust pinch detection with distance and angle
    const pinchDistance = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
    const thumbIsExtended = isFingerUp(landmarks, 0);

    // Erase: thumb and index pinched together, other fingers relaxed
    if (pinchDistance < 0.12 && thumbIsExtended && !middleFinger && !ringFinger && !pinkyFinger) {
      return 'erase';
    }

    if (indexFinger && !middleFinger && !ringFinger && !pinkyFinger) {
      return 'draw';
    }

    if (indexFinger && middleFinger && !ringFinger && !pinkyFinger) {
      return 'move';
    }

    if (!indexFinger && !middleFinger && !ringFinger && !pinkyFinger) {
      return 'pause';
    }

    return 'move';
  }

  function drawCursor(x, y, gesture, color) {
    const isErasing = gesture === 'erase' || state.tool === 'erase';
    const radius = isErasing ? 20 : state.size / 2 + 4;
    const size = radius * 2 + 10;

    elements.cursorDot.width = size;
    elements.cursorDot.height = size;
    elements.cursorDot.style.left = `${x - size / 2}px`;
    elements.cursorDot.style.top = `${y - size / 2}px`;
    elements.cursorDot.style.width = `${size}px`;
    elements.cursorDot.style.height = `${size}px`;

    cursorContext.clearRect(0, 0, size, size);

    if (gesture === 'move') {
      cursorContext.strokeStyle = 'rgba(255,255,255,0.6)';
      cursorContext.lineWidth = 1.5;
      cursorContext.setLineDash([3, 3]);
      cursorContext.beginPath();
      cursorContext.arc(size / 2, size / 2, radius, 0, Math.PI * 2);
      cursorContext.stroke();
      cursorContext.setLineDash([]);
      return;
    }

    if (isErasing) {
      cursorContext.strokeStyle = 'rgba(239,68,68,0.8)';
      cursorContext.lineWidth = 2;
      cursorContext.beginPath();
      cursorContext.arc(size / 2, size / 2, radius, 0, Math.PI * 2);
      cursorContext.stroke();
      cursorContext.strokeStyle = 'rgba(239,68,68,0.3)';
      cursorContext.beginPath();
      cursorContext.moveTo(size / 2 - radius * 0.7, size / 2 - radius * 0.7);
      cursorContext.lineTo(size / 2 + radius * 0.7, size / 2 + radius * 0.7);
      cursorContext.stroke();
      return;
    }

    cursorContext.fillStyle = color;
    cursorContext.shadowColor = color;
    cursorContext.shadowBlur = 8;
    cursorContext.beginPath();
    cursorContext.arc(size / 2, size / 2, state.size / 2, 0, Math.PI * 2);
    cursorContext.fill();

    cursorContext.strokeStyle = 'rgba(255,255,255,0.5)';
    cursorContext.lineWidth = 1.5;
    cursorContext.beginPath();
    cursorContext.arc(size / 2, size / 2, radius, 0, Math.PI * 2);
    cursorContext.stroke();
  }

  function drawHandOnPreview(landmarks) {
    const previewWidth = elements.webcamSmall.width;
    const previewHeight = elements.webcamSmall.height;

    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [0, 9], [9, 10], [10, 11], [11, 12],
      [0, 13], [13, 14], [14, 15], [15, 16],
      [0, 17], [17, 18], [18, 19], [19, 20],
      [5, 9], [9, 13], [13, 17],
    ];

    webcamContext.strokeStyle = 'rgba(124,58,237,0.8)';
    webcamContext.lineWidth = 1.5;

    for (const [startIndex, endIndex] of connections) {
      const startX = (1 - landmarks[startIndex].x) * previewWidth;
      const startY = landmarks[startIndex].y * previewHeight;
      const endX = (1 - landmarks[endIndex].x) * previewWidth;
      const endY = landmarks[endIndex].y * previewHeight;

      webcamContext.beginPath();
      webcamContext.moveTo(startX, startY);
      webcamContext.lineTo(endX, endY);
      webcamContext.stroke();
    }

    for (let i = 0; i < landmarks.length; i += 1) {
      const x = (1 - landmarks[i].x) * previewWidth;
      const y = landmarks[i].y * previewHeight;
      webcamContext.fillStyle = i === 8 ? '#06b6d4' : 'rgba(124,58,237,0.9)';
      webcamContext.beginPath();
      webcamContext.arc(x, y, i === 8 ? 4 : 2, 0, Math.PI * 2);
      webcamContext.fill();
    }
  }

  function onResults(results) {
    if (isDisposed) {
      return;
    }

    const canvasWidth = elements.drawingCanvas.width;
    const canvasHeight = elements.drawingCanvas.height;

    webcamContext.save();
    webcamContext.scale(-1, 1);
    webcamContext.drawImage(results.image, -elements.webcamSmall.width, 0, elements.webcamSmall.width, elements.webcamSmall.height);
    webcamContext.restore();

    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
      clearDrawingState();
      updateStatus('detecting', 'SEARCHING');
      return;
    }

    const landmarks = results.multiHandLandmarks[0];
    drawHandOnPreview(landmarks);

    const gesture = detectGesture(landmarks);
    if (gesture !== lastGesture) {
      showGestureHud(gesture);
      lastGesture = gesture;
    }

    updateStatus('active', gesture.toUpperCase());

    const tip = landmarks[8];
    const rawX = (1 - tip.x) * canvasWidth;
    const rawY = tip.y * canvasHeight;
    const smoothing = 0.15;

    if (state.smoothX === null || state.smoothY === null) {
      state.smoothX = rawX;
      state.smoothY = rawY;
    } else {
      state.smoothX += (rawX - state.smoothX) * smoothing;
      state.smoothY += (rawY - state.smoothY) * smoothing;
    }

    const x = state.smoothX;
    const y = state.smoothY;

    elements.cursorDot.style.display = 'block';
    drawCursor(x, y, gesture, state.color);

    if (gesture !== 'draw' && gesture !== 'erase') {
      state.prevX = null;
      state.prevY = null;
      state.isDrawing = false;
      state.currentStroke = null;
      return;
    }

    const activeTool = gesture === 'erase' ? 'erase' : state.tool;

    if (state.prevX !== null && state.prevY !== null) {
      drawLine(state.prevX, state.prevY, x, y, state.color, state.size, state.opacity, activeTool);
      if (state.currentStroke) {
        state.currentStroke.points.push({ x, y });
      }
    } else {
      state.currentStroke = {
        color: state.color,
        size: activeTool === 'erase' ? state.size * 3 : state.size,
        opacity: state.opacity,
        tool: activeTool,
        points: [{ x, y }],
      };
      state.strokes.push(state.currentStroke);
    }

    state.prevX = x;
    state.prevY = y;
    state.isDrawing = true;
  }

  function toCameraErrorMessage(error) {
    if (!error) {
      return 'Unable to start camera.';
    }

    if (error.name === 'NotAllowedError') {
      return 'Camera permission denied. Allow camera access and retry.';
    }

    if (error.name === 'NotFoundError') {
      return 'No camera detected on this device.';
    }

    if (error.name === 'NotReadableError') {
      return 'Camera is busy in another app. Close it and retry.';
    }

    if (error.name === 'AbortError') {
      return 'Camera startup was interrupted. Retry once.';
    }

    return error.message || 'Unable to start camera.';
  }

  async function stopTracking() {
    if (isStopping) {
      return;
    }

    isStopping = true;

    try {
      try {
        if (cameraInstance && typeof cameraInstance.stop === 'function') {
          await cameraInstance.stop();
        }
      } catch (error) {
        console.warn('Camera stop warning:', error);
      }

      cameraInstance = null;

      if (mediaStream) {
        mediaStream.getTracks().forEach((track) => track.stop());
      }

      mediaStream = null;
      elements.videoEl.srcObject = null;
      clearDrawingState();
    } finally {
      isStopping = false;
    }
  }

  async function startTracking() {
    if (isStarting || isDisposed) {
      return;
    }

    isStarting = true;
    setStartUiLoading(true, 'Loading MediaPipe...');

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('This browser does not support camera access.');
      }

      await ensureMediaPipeLoaded();
      await stopTracking();

      if (!handsInstance) {
        handsInstance = new window.Hands({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
        });

        handsInstance.setOptions({
          maxNumHands: 1,
          modelComplexity: 1,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.45,
        });

        handsInstance.onResults(onResults);
      }

      setStartUiLoading(true, 'Accessing camera...');
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: { ideal: 1280 }, 
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
          facingMode: 'user' 
        },
        audio: false,
      });

      const [videoTrack] = mediaStream.getVideoTracks();
      if (videoTrack) {
        addListener(videoTrack, 'ended', () => {
          if (isStopping || isDisposed) {
            return;
          }

          updateStatus('detecting', 'CAMERA LOST');
          showToast('Camera disconnected. Press R to reconnect.');
        });
      }

      elements.videoEl.srcObject = mediaStream;

      await new Promise((resolve, reject) => {
        elements.videoEl.onloadedmetadata = () => resolve();
        elements.videoEl.onerror = () => reject(new Error('Unable to initialize video stream.'));
      });

      await elements.videoEl.play();

      setStartUiLoading(true, 'Starting hand tracking...');
      cameraInstance = new window.Camera(elements.videoEl, {
        onFrame: async () => {
          if (!handsInstance || isDisposed) {
            return;
          }

          await handsInstance.send({ image: elements.videoEl });
        },
        width: 1280,
        height: 720,
      });

      await cameraInstance.start();

      resizeCanvas();
      elements.onboarding.classList.add('opacity-0', 'pointer-events-none');
      elements.startBtn.textContent = 'Reconnect Camera';
      updateStatus('detecting', 'SEARCHING');
      showToast('Hand tracking active. Show your hand.');
    } catch (error) {
      await stopTracking();
      elements.startBtn.textContent = 'Retry Camera';
      updateStatus('', 'READY');
      showToast(toCameraErrorMessage(error));
      console.error(error);
    } finally {
      isStarting = false;
      setStartUiLoading(false);
    }
  }

  function createColorPalette() {
    const setSwatchState = (swatch, isActive) => {
      swatch.className = `${swatchBaseClass} ${isActive ? swatchActiveClass : ''}`.trim();
      swatch.dataset.active = isActive ? 'true' : 'false';
    };

    elements.colorPalette.innerHTML = '';

    COLORS.forEach((color) => {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.style.background = color;
      swatch.title = color;
      setSwatchState(swatch, color === state.color);

      swatch.addEventListener('click', () => {
        elements.colorPalette
          .querySelectorAll('.color-swatch')
          .forEach((node) => setSwatchState(node, false));

        setSwatchState(swatch, true);
        state.color = color;
        state.tool = 'draw';
        updateToolUi();
      });

      elements.colorPalette.appendChild(swatch);
    });
  }

  function createSizePicker() {
    const setSizeOptionState = (option, isActive) => {
      option.className = `${sizeOptionBaseClass} ${isActive ? sizeOptionActiveClass : ''}`.trim();
      option.dataset.active = isActive ? 'true' : 'false';
    };

    elements.sizePicker.innerHTML = '';

    BRUSH_SIZES.forEach((size) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.style.width = `${size * 1.5}px`;
      option.style.height = `${size * 1.5}px`;
      option.title = `Brush ${size}px`;
      setSizeOptionState(option, size === state.size);

      option.addEventListener('click', () => {
        elements.sizePicker
          .querySelectorAll('.size-option')
          .forEach((node) => setSizeOptionState(node, false));

        setSizeOptionState(option, true);
        state.size = size;
      });

      elements.sizePicker.appendChild(option);
    });
  }

  function onKeyDown(event) {
    if (event.key === 'd' || event.key === 'D') {
      state.tool = 'draw';
      updateToolUi();
      showToast('Draw mode');
    }

    if (event.key === 'e' || event.key === 'E') {
      state.tool = 'erase';
      updateToolUi();
      showToast('Erase mode');
    }

    if (event.key === 'c' || event.key === 'C') {
      clearCanvas();
    }

    if (event.key === 's' || event.key === 'S') {
      saveCanvas();
    }

    if (event.key === 'r' || event.key === 'R') {
      startTracking();
      showToast('Reconnecting camera...');
    }

    if (event.key === 'z' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      if (state.strokes.length > 0) {
        state.strokes.pop();
        redrawStrokes();
        showToast('Undo');
      }
    }
  }

  function onMouseDown(event) {
    mouseDown = true;
    const rect = elements.drawingCanvas.getBoundingClientRect();
    state.prevX = event.clientX - rect.left;
    state.prevY = event.clientY - rect.top;

    state.currentStroke = {
      color: state.color,
      size: state.size,
      opacity: state.opacity,
      tool: state.tool,
      points: [{ x: state.prevX, y: state.prevY }],
    };

    state.strokes.push(state.currentStroke);
  }

  function onMouseMove(event) {
    if (!mouseDown) {
      return;
    }

    const rect = elements.drawingCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    drawLine(state.prevX, state.prevY, x, y, state.color, state.size, state.opacity, state.tool);

    if (state.currentStroke) {
      state.currentStroke.points.push({ x, y });
    }

    state.prevX = x;
    state.prevY = y;
  }

  function onMouseUpOrLeave() {
    mouseDown = false;
    state.prevX = null;
    state.prevY = null;
    state.currentStroke = null;
  }

  createColorPalette();
  createSizePicker();
  updateToolUi();
  updateStatus('', 'READY');
  resizeCanvas();

  addListener(window, 'resize', resizeCanvas);
  addListener(window, 'keydown', onKeyDown);
  addListener(window, 'beforeunload', stopTracking);

  addListener(elements.startBtn, 'click', startTracking);
  addListener(elements.statusPill, 'click', startTracking);
  addListener(elements.opacitySlider, 'input', (event) => {
    state.opacity = Number(event.target.value) / 100;
  });

  addListener(elements.btnDraw, 'click', () => {
    state.tool = 'draw';
    updateToolUi();
  });

  addListener(elements.btnErase, 'click', () => {
    state.tool = 'erase';
    updateToolUi();
  });

  addListener(elements.btnClear, 'click', clearCanvas);
  addListener(elements.btnSave, 'click', saveCanvas);

  addListener(elements.drawingCanvas, 'mousedown', onMouseDown);
  addListener(elements.drawingCanvas, 'mousemove', onMouseMove);
  addListener(elements.drawingCanvas, 'mouseup', onMouseUpOrLeave);
  addListener(elements.drawingCanvas, 'mouseleave', onMouseUpOrLeave);

  // Auto-start camera on page load
  startTracking();

  return () => {
    isDisposed = true;

    clearTimeout(hudTimeoutId);
    clearTimeout(toastTimeoutId);

    for (const cleanup of cleanups) {
      cleanup();
    }

    void stopTracking();
  };
}
