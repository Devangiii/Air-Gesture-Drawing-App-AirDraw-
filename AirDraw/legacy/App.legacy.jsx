import React, { useEffect } from 'react';
import './App.css';

function App() {
  useEffect(() => {
    // ─── State ───────────────────────────────────────────────────────
    const state = {
      color: '#7c3aed',
      size: 5,
      opacity: 1,
      tool: 'draw',   // 'draw' | 'erase'
      isDrawing: false,
      prevX: null, prevY: null,
      gesture: null,
      handVisible: false,
      strokes: [],
      currentStroke: null,
      smoothX: null,
      smoothY: null,
    };

    // ─── DOM ─────────────────────────────────────────────────────────
    const videoEl = document.getElementById('videoEl');
    const drawingCanvas = document.getElementById('drawingCanvas');
    const ctx = drawingCanvas.getContext('2d');
    const webcamSmall = document.getElementById('webcamSmall');
    const wCtx = webcamSmall.getContext('2d');
    const cursorDot = document.getElementById('cursorDot');
    const cursorCtx = cursorDot.getContext('2d');
    const gestureHud = document.getElementById('gestureHud');
    const gestureIcon = document.getElementById('gestureIcon');
    const gestureName = document.getElementById('gestureName');
    const statusPill = document.getElementById('statusPill');
    const statusText = document.getElementById('statusText');
    const onboarding = document.getElementById('onboarding');
    const loadingRow = document.getElementById('loadingRow');
    const loadingMsg = document.getElementById('loadingMsg');
    const canvasArea = document.getElementById('canvasArea');
    const startBtn = document.getElementById('startBtn');

    let handsInstance = null;
    let cameraInstance = null;
    let mediaStream = null;
    let isStarting = false;
    let isStopping = false;

    // ─── Colors ──────────────────────────────────────────────────────
    const colors = [
      '#7c3aed','#06b6d4','#f59e0b','#10b981',
      '#ef4444','#ec4899','#f97316','#ffffff',
      '#94a3b8','#1e293b',
    ];

    const colorPalette = document.getElementById('colorPalette');
    colorPalette.style.cssText = 'display:flex;flex-direction:column;gap:5px;';

    colors.forEach(c => {
      const sw = document.createElement('div');
      sw.className = 'color-swatch' + (c === state.color ? ' active' : '');
      sw.style.background = c;
      sw.title = c;
      sw.onclick = () => {
        document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
        sw.classList.add('active');
        state.color = c;
        state.tool = 'draw';
        updateToolUI();
      };
      colorPalette.appendChild(sw);
    });

    // ─── Sizes ───────────────────────────────────────────────────────
    const sizes = [3, 6, 12, 20];
    const sizePicker = document.getElementById('sizePicker');
    sizes.forEach(s => {
      const dot = document.createElement('div');
      dot.className = 'size-option' + (s === state.size ? ' active' : '');
      dot.style.cssText = `width:${s*1.5}px;height:${s*1.5}px;`;
      dot.onclick = () => {
        document.querySelectorAll('.size-option').forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
        state.size = s;
      };
      sizePicker.appendChild(dot);
    });

    // ─── Opacity ─────────────────────────────────────────────────────
    document.getElementById('opacitySlider').addEventListener('input', e => {
      state.opacity = e.target.value / 100;
    });

    // ─── Tool buttons ────────────────────────────────────────────────
    function updateToolUI() {
      document.getElementById('btnDraw').classList.toggle('active', state.tool === 'draw');
      document.getElementById('btnErase').classList.toggle('active', state.tool === 'erase');
    }

    document.getElementById('btnDraw').onclick = () => { state.tool = 'draw'; updateToolUI(); };
    document.getElementById('btnErase').onclick = () => { state.tool = 'erase'; updateToolUI(); };
    document.getElementById('btnClear').onclick = clearCanvas;
    document.getElementById('btnSave').onclick = saveCanvas;

    function clearCanvas() {
      ctx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
      state.strokes = [];
      showToast('Canvas cleared');
    }

    function saveCanvas() {
      const link = document.createElement('a');
      // Composite on white
      const temp = document.createElement('canvas');
      temp.width = drawingCanvas.width;
      temp.height = drawingCanvas.height;
      const tc = temp.getContext('2d');
      tc.fillStyle = '#080810';
      tc.fillRect(0,0,temp.width,temp.height);
      tc.drawImage(drawingCanvas,0,0);
      link.download = 'airdraw-' + Date.now() + '.png';
      link.href = temp.toDataURL();
      link.click();
      showToast('Image saved!');
    }

    // ─── Resize ──────────────────────────────────────────────────────
    function resize() {
      const { width, height } = canvasArea.getBoundingClientRect();
      const nextWidth = Math.max(1, Math.floor(width));
      const nextHeight = Math.max(1, Math.floor(height));

      if (drawingCanvas.width === nextWidth && drawingCanvas.height === nextHeight) {
        return;
      }

      drawingCanvas.width = nextWidth;
      drawingCanvas.height = nextHeight;
      redrawStrokes();
    }

    window.addEventListener('resize', resize);

    // ─── Gesture detection ───────────────────────────────────────────
    function isFingerUp(lm, finger) {
      // finger: 0=thumb,1=index,2=middle,3=ring,4=pinky
      const tips = [4,8,12,16,20];
      const pips = [3,6,10,14,18];
      if (finger === 0) {
        return lm[4].x < lm[3].x; // thumb: tip left of knuckle (mirrored)
      }
      return lm[tips[finger]].y < lm[pips[finger]].y;
    }

    function detectGesture(lm) {
      const index = isFingerUp(lm, 1);
      const middle = isFingerUp(lm, 2);
      const ring = isFingerUp(lm, 3);
      const pinky = isFingerUp(lm, 4);

      // Pinch: thumb + index close
      const thumbTip = lm[4];
      const indexTip = lm[8];
      const pinchDist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
      if (pinchDist < 0.06 && !middle && !ring && !pinky) return 'erase';

      if (index && !middle && !ring && !pinky) return 'draw';
      if (index && middle && !ring && !pinky) return 'move';
      if (!index && !middle && !ring && !pinky) return 'pause';

      return 'move';
    }

    // ─── Drawing ─────────────────────────────────────────────────────
    function drawLine(x1, y1, x2, y2, color, size, opacity, tool) {
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (tool === 'erase') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
        ctx.lineWidth = size * 3;
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = color;
        ctx.lineWidth = size;
      }

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.restore();
    }

    function redrawStrokes() {
      ctx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
      for (const stroke of state.strokes) {
        for (let i = 1; i < stroke.points.length; i++) {
          drawLine(
            stroke.points[i-1].x, stroke.points[i-1].y,
            stroke.points[i].x, stroke.points[i].y,
            stroke.color, stroke.size, stroke.opacity, stroke.tool
          );
        }
      }
    }

    // ─── Cursor dot ──────────────────────────────────────────────────
    function drawCursor(x, y, gesture, color) {
      const isErasing = gesture === 'erase' || state.tool === 'erase';
      const r = isErasing ? 20 : (state.size / 2 + 4);
      const sz = r * 2 + 10;

      cursorDot.width = sz;
      cursorDot.height = sz;
      cursorDot.style.left = (x - sz/2) + 'px';
      cursorDot.style.top = (y - sz/2) + 'px';
      cursorDot.style.width = sz + 'px';
      cursorDot.style.height = sz + 'px';

      const c = cursorDot.getContext('2d');
      c.clearRect(0, 0, sz, sz);

      if (gesture === 'move') {
        // Crosshair
        c.strokeStyle = 'rgba(255,255,255,0.6)';
        c.lineWidth = 1.5;
        c.setLineDash([3,3]);
        c.beginPath();
        c.arc(sz/2, sz/2, r, 0, Math.PI*2);
        c.stroke();
        c.setLineDash([]);
      } else if (isErasing) {
        c.strokeStyle = 'rgba(239,68,68,0.8)';
        c.lineWidth = 2;
        c.beginPath();
        c.arc(sz/2, sz/2, r, 0, Math.PI*2);
        c.stroke();
        c.strokeStyle = 'rgba(239,68,68,0.3)';
        c.beginPath();
        c.moveTo(sz/2-r*0.7, sz/2-r*0.7);
        c.lineTo(sz/2+r*0.7, sz/2+r*0.7);
        c.stroke();
      } else {
        // Dot
        c.fillStyle = color;
        c.shadowColor = color;
        c.shadowBlur = 8;
        c.beginPath();
        c.arc(sz/2, sz/2, state.size/2, 0, Math.PI*2);
        c.fill();

        c.strokeStyle = 'rgba(255,255,255,0.5)';
        c.lineWidth = 1.5;
        c.beginPath();
        c.arc(sz/2, sz/2, r, 0, Math.PI*2);
        c.stroke();
      }
    }

    // ─── Gesture HUD ─────────────────────────────────────────────────
    const gestureMap = {
      draw:  { icon: '☝️', label: 'Drawing' },
      move:  { icon: '✌️', label: 'Moving' },
      pause: { icon: '✊', label: 'Paused' },
      erase: { icon: '🤏', label: 'Erasing' },
    };

    let hudTimeout;
    function showGestureHud(g) {
      if (!g || !gestureMap[g]) return;
      const info = gestureMap[g];
      gestureIcon.textContent = info.icon;
      gestureName.textContent = info.label;
      gestureHud.classList.add('visible');
      clearTimeout(hudTimeout);
      hudTimeout = setTimeout(() => gestureHud.classList.remove('visible'), 1500);
    }

    // ─── MediaPipe results ───────────────────────────────────────────
    let lastGesture = null;

    function onResults(results) {
      const W = drawingCanvas.width;
      const H = drawingCanvas.height;

      // Draw webcam preview (mirrored)
      wCtx.save();
      wCtx.scale(-1, 1);
      wCtx.drawImage(results.image, -webcamSmall.width, 0, webcamSmall.width, webcamSmall.height);
      wCtx.restore();

      // Draw landmarks on webcam preview
      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const lm = results.multiHandLandmarks[0];
        state.handVisible = true;

        // Draw skeleton on preview
        drawHandOnPreview(lm);

        const gesture = detectGesture(lm);

        if (gesture !== lastGesture) {
          showGestureHud(gesture);
          lastGesture = gesture;
        }

        // Update status
        updateStatus('active', gesture.toUpperCase());

        // Get index fingertip position (mirrored)
        const tip = lm[8];
        const rawX = (1 - tip.x) * W;
        const rawY = tip.y * H;
        const smoothing = 0.35;

        if (state.smoothX === null || state.smoothY === null) {
          state.smoothX = rawX;
          state.smoothY = rawY;
        } else {
          state.smoothX += (rawX - state.smoothX) * smoothing;
          state.smoothY += (rawY - state.smoothY) * smoothing;
        }

        const x = state.smoothX;
        const y = state.smoothY;

        cursorDot.style.display = 'block';
        drawCursor(x, y, gesture, state.color);

        if (gesture === 'draw' || (gesture === 'erase')) {
          const activeTool = gesture === 'erase' ? 'erase' : state.tool;

          if (state.prevX !== null && state.prevY !== null) {
            drawLine(state.prevX, state.prevY, x, y, state.color, state.size, state.opacity, activeTool);

            if (state.currentStroke) {
              state.currentStroke.points.push({x, y});
            }
          } else {
            // Start new stroke
            state.currentStroke = {
              color: state.color,
              size: activeTool === 'erase' ? state.size * 3 : state.size,
              opacity: state.opacity,
              tool: activeTool,
              points: [{x, y}]
            };
            state.strokes.push(state.currentStroke);
          }

          state.prevX = x;
          state.prevY = y;
          state.isDrawing = true;

        } else {
          state.prevX = null;
          state.prevY = null;
          state.isDrawing = false;
          state.currentStroke = null;
        }

      } else {
        state.handVisible = false;
        state.prevX = null;
        state.prevY = null;
        state.isDrawing = false;
        state.currentStroke = null;
        state.smoothX = null;
        state.smoothY = null;
        cursorDot.style.display = 'none';

        updateStatus('detecting', 'SEARCHING');

        // Clear preview
        wCtx.save();
        wCtx.scale(-1, 1);
        wCtx.drawImage(results.image, -webcamSmall.width, 0, webcamSmall.width, webcamSmall.height);
        wCtx.restore();
      }
    }

    // Draw hand skeleton on webcam preview
    function drawHandOnPreview(lm) {
      const pw = webcamSmall.width;
      const ph = webcamSmall.height;

      const connections = [
        [0,1],[1,2],[2,3],[3,4],
        [0,5],[5,6],[6,7],[7,8],
        [0,9],[9,10],[10,11],[11,12],
        [0,13],[13,14],[14,15],[15,16],
        [0,17],[17,18],[18,19],[19,20],
        [5,9],[9,13],[13,17]
      ];

      wCtx.strokeStyle = 'rgba(124,58,237,0.8)';
      wCtx.lineWidth = 1.5;

      for (const [a, b] of connections) {
        const ax = (1 - lm[a].x) * pw;
        const ay = lm[a].y * ph;
        const bx = (1 - lm[b].x) * pw;
        const by = lm[b].y * ph;
        wCtx.beginPath();
        wCtx.moveTo(ax, ay);
        wCtx.lineTo(bx, by);
        wCtx.stroke();
      }

      // Landmark dots
      for (let i = 0; i < lm.length; i++) {
        const x = (1 - lm[i].x) * pw;
        const y = lm[i].y * ph;
        wCtx.fillStyle = i === 8 ? '#06b6d4' : 'rgba(124,58,237,0.9)';
        wCtx.beginPath();
        wCtx.arc(x, y, i === 8 ? 4 : 2, 0, Math.PI*2);
        wCtx.fill();
      }
    }

    // ─── Status ──────────────────────────────────────────────────────
    function updateStatus(type, text) {
      statusPill.className = 'status-pill ' + type;
      statusText.textContent = text;
    }

    // ─── Toast ───────────────────────────────────────────────────────
    let toastTimer;
    function showToast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
    }

    // ─── Start ───────────────────────────────────────────────────────
    function setStartUiLoading(isLoading, message = '') {
      startBtn.disabled = isLoading;
      startBtn.style.display = isLoading ? 'none' : '';
      loadingRow.style.display = isLoading ? 'flex' : 'none';
      if (message) loadingMsg.textContent = message;
    }

    function toCameraErrorMessage(err) {
      if (!err) return 'Unable to start camera.';
      if (err.name === 'NotAllowedError') return 'Camera permission denied. Allow camera access and retry.';
      if (err.name === 'NotFoundError') return 'No camera detected on this device.';
      if (err.name === 'NotReadableError') return 'Camera is busy in another app. Close it and retry.';
      if (err.name === 'AbortError') return 'Camera startup was interrupted. Retry once.';
      return err.message || 'Unable to start camera.';
    }

    async function stopTracking() {
      if (isStopping) return;
      isStopping = true;
      try {
        try {
          if (cameraInstance && typeof cameraInstance.stop === 'function') {
            await cameraInstance.stop();
          }
        } catch (err) {
          console.warn('Camera stop warning:', err);
        }

        cameraInstance = null;

        if (mediaStream) {
          mediaStream.getTracks().forEach(track => track.stop());
        }

        mediaStream = null;
        videoEl.srcObject = null;

        state.prevX = null;
        state.prevY = null;
        state.isDrawing = false;
        state.currentStroke = null;
        state.smoothX = null;
        state.smoothY = null;
        cursorDot.style.display = 'none';
      } finally {
        isStopping = false;
      }
    }

    async function startTracking() {
      if (isStarting) return;
      isStarting = true;
      setStartUiLoading(true, 'Loading MediaPipe…');

      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('This browser does not support camera access.');
        }
        if (!window.Hands || !window.Camera) {
          throw new Error('MediaPipe scripts did not load. Check internet/CDN access and refresh.');
        }

        await stopTracking();

        if (!handsInstance) {
          handsInstance = new window.Hands({
            locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`
          });
          handsInstance.setOptions({
            maxNumHands: 1,
            modelComplexity: 1,
            minDetectionConfidence: 0.75,
            minTrackingConfidence: 0.6
          });
          handsInstance.onResults(onResults);
        }

        setStartUiLoading(true, 'Accessing camera…');
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720, facingMode: 'user' },
          audio: false
        });

        const [videoTrack] = mediaStream.getVideoTracks();
        if (videoTrack) {
          videoTrack.addEventListener('ended', () => {
            if (isStopping) return;
            updateStatus('detecting', 'CAMERA LOST');
            showToast('Camera disconnected. Press R to reconnect.');
          });
        }

        videoEl.srcObject = mediaStream;
        await new Promise((resolve, reject) => {
          videoEl.onloadedmetadata = () => resolve();
          videoEl.onerror = () => reject(new Error('Unable to initialize video stream.'));
        });
        await videoEl.play();

        setStartUiLoading(true, 'Starting hand tracking…');
        cameraInstance = new window.Camera(videoEl, {
          onFrame: async () => {
            if (handsInstance) await handsInstance.send({ image: videoEl });
          },
          width: 1280,
          height: 720
        });
        await cameraInstance.start();

        resize();
        onboarding.classList.add('hidden');
        startBtn.textContent = 'Reconnect Camera';
        updateStatus('detecting', 'SEARCHING');
        showToast('Hand tracking active - show your hand!');
      } catch (err) {
        await stopTracking();
        console.error(err);
        startBtn.textContent = 'Retry Camera';
        updateStatus('', 'READY');
        showToast(toCameraErrorMessage(err));
      } finally {
        isStarting = false;
        setStartUiLoading(false);
      }
    }

    startBtn.addEventListener('click', startTracking);
    statusPill.title = 'Click to reconnect camera';
    statusPill.style.cursor = 'pointer';
    statusPill.addEventListener('click', startTracking);
    window.addEventListener('beforeunload', stopTracking);

    // Initial resize
    window.addEventListener('load', resize);

    // Keyboard shortcuts
    window.addEventListener('keydown', e => {
      if (e.key === 'd' || e.key === 'D') { state.tool = 'draw'; updateToolUI(); showToast('Draw mode'); }
      if (e.key === 'e' || e.key === 'E') { state.tool = 'erase'; updateToolUI(); showToast('Erase mode'); }
      if (e.key === 'c' || e.key === 'C') clearCanvas();
      if (e.key === 's' || e.key === 'S') saveCanvas();
      if (e.key === 'r' || e.key === 'R') { startTracking(); showToast('Reconnecting camera...'); }
      if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
        // Undo last stroke
        e.preventDefault();
        if (state.strokes.length > 0) {
          state.strokes.pop();
          redrawStrokes();
          showToast('Undo');
        }
      }
    });

    // Also allow mouse drawing (desktop fallback)
    let mouseDown = false;
    drawingCanvas.addEventListener('mousedown', e => {
      mouseDown = true;
      const r = drawingCanvas.getBoundingClientRect();
      state.prevX = e.clientX - r.left;
      state.prevY = e.clientY - r.top;
      state.currentStroke = {
        color: state.color, size: state.size, opacity: state.opacity, tool: state.tool,
        points: [{x: state.prevX, y: state.prevY}]
      };
      state.strokes.push(state.currentStroke);
    });

    drawingCanvas.addEventListener('mousemove', e => {
      if (!mouseDown) return;
      const r = drawingCanvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      drawLine(state.prevX, state.prevY, x, y, state.color, state.size, state.opacity, state.tool);
      state.currentStroke && state.currentStroke.points.push({x, y});
      state.prevX = x; state.prevY = y;
    });

    drawingCanvas.addEventListener('mouseup', () => { mouseDown = false; state.prevX = null; state.prevY = null; state.currentStroke = null; });
    drawingCanvas.addEventListener('mouseleave', () => { mouseDown = false; state.prevX = null; state.prevY = null; state.currentStroke = null; });
  }, []);

  return (
    <>
      <header>
        <div>
          <span className="logo">AirDraw <span>v2.0</span></span>
        </div>
        <div className="status-pill" id="statusPill">
          <div className="dot"></div>
          <span id="statusText">READY</span>
        </div>
      </header>

      <main>
        {/* Sidebar tools */}
        <div className="sidebar">
          <div className="sidebar-section">
            <div className="sidebar-label">Color</div>
            <div id="colorPalette"></div>
          </div>

          <div className="divider"></div>

          <div className="sidebar-section">
            <div className="sidebar-label">Size</div>
            <div className="size-track" id="sizePicker"></div>
          </div>

          <div className="divider"></div>

          <div className="sidebar-section">
            <div className="sidebar-label">Opacity</div>
            <div className="opacity-track">
              <input type="range" className="vert" id="opacitySlider" min="10" max="100" defaultValue="100" />
            </div>
          </div>

          <div className="divider"></div>

          <div className="sidebar-section">
            <div className="sidebar-label">Tools</div>
            <button className="tool-btn active" id="btnDraw" title="Draw">✏️</button>
            <button className="tool-btn" id="btnErase" title="Eraser">🧹</button>
            <button className="tool-btn danger" id="btnClear" title="Clear canvas">🗑️</button>
            <button className="tool-btn" id="btnSave" title="Save image">💾</button>
          </div>
        </div>

        {/* Canvas area */}
        <div className="canvas-area" id="canvasArea">
          <video id="videoEl" autoPlay playsInline muted></video>
          <canvas id="drawingCanvas"></canvas>
          <canvas id="webcamCanvas"></canvas>

          {/* Webcam preview */}
          <div className="webcam-preview" id="webcamPreview" title="Click to toggle webcam feed size">
            <canvas id="webcamSmall" width="320" height="240"></canvas>
            <div className="webcam-label">📷 LIVE · HAND TRACKING</div>
          </div>

          {/* Gesture HUD */}
          <div className="gesture-hud" id="gestureHud">
            <span className="gesture-icon" id="gestureIcon">✌️</span>
            <span className="gesture-name" id="gestureName">Drawing</span>
          </div>

          {/* Cursor dot */}
          <canvas id="cursorDot" width="30" height="30"></canvas>

          {/* Onboarding */}
          <div id="onboarding">
            <div className="onboarding-title">✋ AirDraw</div>
            <div className="onboarding-sub">Draw in the air with your hand.<br />No stylus. No touch. Just gestures.</div>
            <div className="gesture-guide">
              <div className="gesture-card">
                <div className="icon">☝️</div>
                <div className="gname">Draw</div>
                <div className="gdesc">Index finger up only</div>
              </div>
              <div className="gesture-card">
                <div className="icon">✌️</div>
                <div className="gname">Move</div>
                <div className="gdesc">Index + middle up</div>
              </div>
              <div className="gesture-card">
                <div className="icon">✊</div>
                <div className="gname">Pause</div>
                <div className="gdesc">Close fist</div>
              </div>
              <div className="gesture-card">
                <div className="icon">🤏</div>
                <div className="gname">Erase</div>
                <div className="gdesc">Pinch thumb+index</div>
              </div>
            </div>
            <button className="start-btn" id="startBtn">Enable Camera &amp; Start</button>
            <div id="loadingRow" style={{display:'none', alignItems:'center', gap:'12px', fontFamily:"'Space Mono',monospace", fontSize:'0.75rem', color:'var(--text-dim)'}}>
              <div className="spinner"></div>
              <span id="loadingMsg">Loading MediaPipe…</span>
            </div>
          </div>
        </div>
      </main>

      <div className="toast" id="toast"></div>
    </>
  );
}

export default App;
