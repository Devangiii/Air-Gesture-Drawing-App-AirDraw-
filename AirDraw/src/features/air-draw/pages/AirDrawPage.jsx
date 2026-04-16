import { useEffect } from 'react';
import { initAirDraw } from '../runtime/initAirDraw';

function AirDrawPage() {
  useEffect(() => {
    const cleanup = initAirDraw();
    return cleanup;
  }, []);

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[#0a0a0f] font-display text-slate-200 select-none">
      <div className="pointer-events-none fixed left-[-20%] top-[-30%] z-0 h-[70%] w-[60%] bg-[radial-gradient(ellipse,rgba(124,58,237,0.12)_0%,transparent_70%)]" />
      <div className="pointer-events-none fixed bottom-[-20%] right-[-10%] z-0 h-[60%] w-[50%] bg-[radial-gradient(ellipse,rgba(6,182,212,0.08)_0%,transparent_70%)]" />

      <header className="relative z-10 flex items-center justify-between border-b border-[#1e1e2e] bg-[rgba(10,10,15,0.8)] px-6 py-3 backdrop-blur">
        <div>
          <span className="bg-gradient-to-br from-violet-500 to-cyan-400 bg-clip-text text-xl font-extrabold tracking-tight text-transparent">
            AirDraw
            <span className="ml-2 font-mono text-xs font-normal tracking-[0.08em] text-slate-500">v2.0</span>
          </span>
        </div>

        <button
          type="button"
          id="statusPill"
          className="flex cursor-pointer items-center gap-1.5 rounded-full border border-[#1e1e2e] bg-[#111118] px-3 py-1.5 font-mono text-[0.7rem] text-slate-500 transition-all duration-300"
          title="Click to reconnect camera"
        >
          <span id="statusDot" className="h-[7px] w-[7px] rounded-full bg-slate-500 transition-all duration-300" />
          <span id="statusText">READY</span>
        </button>
      </header>

      <main className="relative z-[1] flex flex-1 overflow-hidden max-md:flex-col">
        <aside className="flex w-[88px] flex-shrink-0 flex-col items-center gap-2 overflow-x-auto border-r border-[#1e1e2e] bg-[#111118] px-0 py-4 max-md:h-[86px] max-md:w-full max-md:flex-row max-md:justify-center max-md:border-b max-md:border-r-0 max-md:p-2">
          <section className="flex w-full flex-col items-center gap-1.5 px-2.5 max-md:w-auto max-md:flex-row max-md:gap-2 max-md:px-2">
            <div className="mb-0.5 text-[0.55rem] uppercase tracking-[0.1em] text-slate-500 max-md:m-0 max-md:[writing-mode:vertical-rl] max-md:[transform:rotate(180deg)]">
              Color
            </div>
            <div id="colorPalette" className="flex flex-col gap-[5px] max-md:flex-row" />
          </section>

          <div className="my-2 h-px w-10 bg-[#1e1e2e] max-md:mx-1 max-md:my-0 max-md:h-12 max-md:w-px" />

          <section className="flex w-full flex-col items-center gap-1.5 px-2.5 max-md:w-auto max-md:flex-row max-md:gap-2 max-md:px-2">
            <div className="mb-0.5 text-[0.55rem] uppercase tracking-[0.1em] text-slate-500 max-md:m-0 max-md:[writing-mode:vertical-rl] max-md:[transform:rotate(180deg)]">
              Size
            </div>
            <div className="flex w-9 flex-col items-center gap-[5px] max-md:w-auto max-md:flex-row" id="sizePicker" />
          </section>

          <div className="my-2 h-px w-10 bg-[#1e1e2e] max-md:mx-1 max-md:my-0 max-md:h-12 max-md:w-px" />

          <section className="flex w-full flex-col items-center gap-1.5 px-2.5 max-md:w-auto max-md:flex-row max-md:gap-2 max-md:px-2">
            <div className="mb-0.5 text-[0.55rem] uppercase tracking-[0.1em] text-slate-500 max-md:m-0 max-md:[writing-mode:vertical-rl] max-md:[transform:rotate(180deg)]">
              Opacity
            </div>
            <div className="flex w-9 flex-col items-center">
              <input
                type="range"
                id="opacitySlider"
                min="10"
                max="100"
                defaultValue="100"
                className="h-[70px] w-9 cursor-pointer accent-violet-500 [direction:rtl] [writing-mode:vertical-lr] max-md:h-3 max-md:w-20 max-md:[direction:ltr] max-md:[writing-mode:horizontal-tb]"
              />
            </div>
          </section>

          <div className="my-2 h-px w-10 bg-[#1e1e2e] max-md:mx-1 max-md:my-0 max-md:h-12 max-md:w-px" />

          <section className="flex w-full flex-col items-center gap-1.5 px-2.5 max-md:w-auto max-md:flex-row max-md:gap-2 max-md:px-2">
            <div className="mb-0.5 text-[0.55rem] uppercase tracking-[0.1em] text-slate-500 max-md:m-0 max-md:[writing-mode:vertical-rl] max-md:[transform:rotate(180deg)]">
              Tools
            </div>
            <button type="button" id="btnDraw" title="Draw" className="tool-btn">Draw</button>
            <button type="button" id="btnErase" title="Eraser" className="tool-btn">Erase</button>
            <button type="button" id="btnClear" title="Clear canvas" className="tool-btn" data-variant="danger">Clear</button>
            <button type="button" id="btnSave" title="Save image" className="tool-btn">Save</button>
          </section>
        </aside>

        <section
          id="canvasArea"
          className="relative flex flex-1 items-center justify-center overflow-hidden bg-[#080810] before:pointer-events-none before:absolute before:inset-0 before:bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] before:bg-[size:40px_40px]"
        >
          <video id="videoEl" autoPlay playsInline muted className="absolute inset-0 z-0 h-full w-full scale-x-[-1] object-cover opacity-0" />
          <canvas id="drawingCanvas" className="absolute inset-0 z-[2] h-full w-full" />

          <div className="absolute bottom-5 right-5 z-20 overflow-hidden rounded-2xl border border-[#1e1e2e] shadow-[0_8px_32px_rgba(0,0,0,0.6)] transition-all duration-300 hover:scale-[1.03] hover:shadow-[0_12px_40px_rgba(0,0,0,0.8)] max-md:bottom-3 max-md:right-3" title="Live hand tracking preview">
            <canvas id="webcamSmall" width="320" height="240" className="block h-[150px] w-[200px] max-md:h-[120px] max-md:w-[160px]" />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[rgba(0,0,0,0.8)] to-transparent px-2.5 py-1.5 font-mono text-[0.6rem] tracking-[0.08em] text-slate-500">
              LIVE HAND TRACKING
            </div>
          </div>

          <div id="gestureHud" className="absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-2.5 rounded-full border border-[#1e1e2e] bg-[rgba(10,10,15,0.85)] px-5 py-2 font-mono text-[0.72rem] text-slate-500 opacity-0 backdrop-blur transition-all duration-300">
            <span id="gestureIcon" className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-violet-500/20 text-cyan-400">D</span>
            <span id="gestureName" className="text-slate-200">Drawing</span>
          </div>

          <canvas id="cursorDot" width="30" height="30" className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-1/2 transition-[width,height] duration-100" />

          <div id="onboarding" className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-[rgba(8,8,16,0.95)] px-6 backdrop-blur transition-opacity duration-500">
            <div className="bg-gradient-to-br from-violet-500 to-cyan-400 bg-clip-text text-center text-4xl font-extrabold tracking-tight text-transparent max-md:text-3xl">
              AirDraw
            </div>

            <div className="max-w-[400px] text-center font-mono text-[0.8rem] leading-7 text-slate-500 max-md:text-[0.72rem]">
              Draw in the air with your hand.
              <br />
              No stylus. No touch. Just gestures.
            </div>

            <div className="flex max-w-[640px] flex-wrap justify-center gap-5 max-md:max-w-[360px] max-md:gap-2.5">
              <div className="flex min-w-[110px] flex-col items-center gap-2 rounded-2xl border border-[#1e1e2e] bg-[#111118] px-5 py-4 transition-all duration-200 hover:border-violet-500 hover:bg-violet-500/10 max-md:min-w-[90px] max-md:px-3.5 max-md:py-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-500/15 font-mono">D</div>
                <div className="text-sm font-bold">Draw</div>
                <div className="text-center font-mono text-[0.65rem] text-slate-500">Index finger up only</div>
              </div>
              <div className="flex min-w-[110px] flex-col items-center gap-2 rounded-2xl border border-[#1e1e2e] bg-[#111118] px-5 py-4 transition-all duration-200 hover:border-violet-500 hover:bg-violet-500/10 max-md:min-w-[90px] max-md:px-3.5 max-md:py-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-500/15 font-mono">M</div>
                <div className="text-sm font-bold">Move</div>
                <div className="text-center font-mono text-[0.65rem] text-slate-500">Index + middle up</div>
              </div>
              <div className="flex min-w-[110px] flex-col items-center gap-2 rounded-2xl border border-[#1e1e2e] bg-[#111118] px-5 py-4 transition-all duration-200 hover:border-violet-500 hover:bg-violet-500/10 max-md:min-w-[90px] max-md:px-3.5 max-md:py-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-500/15 font-mono">P</div>
                <div className="text-sm font-bold">Pause</div>
                <div className="text-center font-mono text-[0.65rem] text-slate-500">Close fist</div>
              </div>
              <div className="flex min-w-[110px] flex-col items-center gap-2 rounded-2xl border border-[#1e1e2e] bg-[#111118] px-5 py-4 transition-all duration-200 hover:border-violet-500 hover:bg-violet-500/10 max-md:min-w-[90px] max-md:px-3.5 max-md:py-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-500/15 font-mono">E</div>
                <div className="text-sm font-bold">Erase</div>
                <div className="text-center font-mono text-[0.65rem] text-slate-500">Pinch thumb and index</div>
              </div>
            </div>

            <button type="button" id="startBtn" className="rounded-full bg-gradient-to-br from-violet-500 to-violet-700 px-9 py-3.5 text-base font-bold tracking-wide text-white shadow-[0_4px_20px_rgba(124,58,237,0.4)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_28px_rgba(124,58,237,0.5)] active:translate-y-0">
              Enable Camera and Start
            </button>

            <div id="loadingRow" className="hidden items-center gap-3 font-mono text-xs text-slate-500">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-violet-500" />
              <span id="loadingMsg">Loading MediaPipe...</span>
            </div>
          </div>
        </section>
      </main>

      <div id="toast" className="pointer-events-none fixed bottom-6 left-1/2 z-[100] -translate-x-1/2 translate-y-24 rounded-full border border-[#1e1e2e] bg-[#111118] px-5 py-2 font-mono text-[0.72rem] text-slate-200 transition-transform duration-300" />
    </div>
  );
}

export default AirDrawPage;
