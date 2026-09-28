// When the desktop launcher starts the server, the server stops itself once no dashboard
// window is open, so closing the app window is all it takes to shut everything down.
// Open windows check in every 20 seconds (see app/components/KeepAlive.jsx).

const TICK = 15 * 1000;
const AFTER_CLOSE = 45 * 1000; // a window said goodbye (closed or reloading)
const SILENT = 10 * 60 * 1000; // no word at all: Windows may pause minimized windows, so be patient

// Route handlers and instrumentation can be bundled separately, so state lives on globalThis.
const state = (globalThis.__dashboardAlive ??= { seen: Date.now(), closing: false, started: false });

export function noteAlive(closing = false) {
  state.seen = Date.now();
  state.closing = closing;
}

export function startAutoStop() {
  if (state.started) return;
  state.started = true;
  noteAlive();
  let lastTick = Date.now();

  setInterval(() => {
    const now = Date.now();
    // A long gap between ticks means the PC was asleep. Give windows a chance to check back in.
    if (now - lastTick > TICK * 4) noteAlive();
    lastTick = now;

    const quiet = now - state.seen;
    if (quiet > (state.closing ? AFTER_CLOSE : SILENT)) {
      console.log("No dashboard window is open. Stopping the server.");
      process.exit(0);
    }
  }, TICK);
}
