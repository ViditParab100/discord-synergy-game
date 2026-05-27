// shared/coords.js
//
// All coordinate math lives here so the rest of the game treats the board
// as a clean 2D grid. Two layers:
//
//   1. LOGICAL <-> CANVAS      gridToWorld / worldToGrid / bench helpers
//      (col,row) <-> (cx,cy)   These are the only thing combat/drag should care about.
//
//   2. CANVAS <-> SCREEN       project / unproject
//      (cx,cy)  <-> (sx,sy)    Phase-1 perspective. Disabled by default; flip
//                              `Perspective.enabled = true` to activate.
//
// Browser: <script src="../shared/coords.js"></script> exposes
//   window.BOARD, window.gridToWorld, window.worldToGrid, window.benchSlotAt,
//   window.benchSlotCenter, window.Perspective, window.patchPhaserPointer.

(function (global) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Board layout (canvas pixels — match game.js constants).
  // ---------------------------------------------------------------------------
  const BOARD = {
    COLS: 3,
    ROWS: 7,
    CELL: 60,
    P1: { x: 150, y: 50 },
    P2: { x: 400, y: 50 },
    BENCH: { x: 30, y: 50, w: 80, slots: 7 } // height = slots * CELL
  };

  // ---------------------------------------------------------------------------
  // LOGICAL <-> CANVAS
  // ---------------------------------------------------------------------------
  function gridToWorld(col, row, side = 'p1') {
    const o = side === 'p2' ? BOARD.P2 : BOARD.P1;
    return {
      x: o.x + col * BOARD.CELL + BOARD.CELL / 2,
      y: o.y + row * BOARD.CELL + BOARD.CELL / 2
    };
  }

  function worldToGrid(x, y, side = 'p1') {
    const o = side === 'p2' ? BOARD.P2 : BOARD.P1;
    const col = Math.floor((x - o.x) / BOARD.CELL);
    const row = Math.floor((y - o.y) / BOARD.CELL);
    if (col < 0 || col >= BOARD.COLS) return null;
    if (row < 0 || row >= BOARD.ROWS) return null;
    return { col, row, side };
  }

  function whichSide(x, y) {
    if (worldToGrid(x, y, 'p1')) return 'p1';
    if (worldToGrid(x, y, 'p2')) return 'p2';
    return null;
  }

  function benchSlotAt(x, y) {
    const b = BOARD.BENCH;
    if (x < b.x || x > b.x + b.w) return -1;
    if (y < b.y || y > b.y + b.slots * BOARD.CELL) return -1;
    return Math.floor((y - b.y) / BOARD.CELL);
  }

  function benchSlotCenter(slot) {
    const b = BOARD.BENCH;
    return {
      x: b.x + b.w / 2,
      y: b.y + slot * BOARD.CELL + BOARD.CELL / 2
    };
  }

  // ---------------------------------------------------------------------------
  // CANVAS <-> SCREEN  (Phase 1 perspective)
  // ---------------------------------------------------------------------------
  //
  // We tilt the board away from the viewer by rotating the (x, y) plane around
  // its horizontal centerline by `angle`, then applying a perspective divide.
  // This is the same math CSS does for `perspective(P) rotateX(angle)`, but we
  // run it in JS so Phaser's input pipeline doesn't get confused by transformed
  // bounding rects.
  //
  // For Phase 0 the projection is identity. When you're ready for Phase 1:
  //   1. Apply matching CSS to the canvas so the visual matches:
  //        transform: perspective(900px) rotateX(28deg);
  //        transform-origin: 50% 50%;
  //   2. Set `Perspective.enabled = true` and `Perspective.angleDeg = 28`.
  //   3. Call `patchPhaserPointer(game)` once after `new Phaser.Game(config)`
  //      so pointer events un-project back to canvas space.
  //
  // The (cx, cy) <-> (sx, sy) functions assume the perspective origin sits at
  // the canvas center.
  // ---------------------------------------------------------------------------

  const Perspective = {
    enabled: false,
    angleDeg: 28,         // tilt of the board
    perspective: 900,     // matches the CSS `perspective()` value
    canvasW: 650,         // keep in sync with Phaser config
    canvasH: 550
  };

  function _rot() {
    const a = Perspective.angleDeg * Math.PI / 180;
    return { s: Math.sin(a), c: Math.cos(a) };
  }

  // Canvas pixel -> screen pixel (on the visually tilted board).
  // Use this if you ever need to draw HTML overlays aligned to a board tile.
  function project(cx, cy) {
    if (!Perspective.enabled) return { x: cx, y: cy };
    const P = Perspective.perspective;
    const { s, c } = _rot();
    const ox = Perspective.canvasW / 2;
    const oy = Perspective.canvasH / 2;

    // Translate to origin, rotate around X axis, then perspective divide.
    const ly = cy - oy;
    const ry = ly * c;       // rotated y
    const rz = -ly * s;      // rotated z (negative = away from camera)
    const k  = P / (P - rz); // perspective factor

    return {
      x: ox + (cx - ox) * k,
      y: oy + ry * k
    };
  }

  // Screen pixel -> canvas pixel. Inverse of `project`.
  // This is what we apply to incoming pointer events when the canvas has the
  // CSS perspective transform on it.
  function unproject(sx, sy) {
    if (!Perspective.enabled) return { x: sx, y: sy };
    const P = Perspective.perspective;
    const { s, c } = _rot();
    const ox = Perspective.canvasW / 2;
    const oy = Perspective.canvasH / 2;

    // Solve for the pre-projection (cx, cy) given (sx, sy).
    // From project():
    //   sy - oy = ly * c * P / (P + ly * s)
    // Let dy = sy - oy:
    //   dy * (P + ly*s) = ly * c * P
    //   ly = dy * P / (c * P - dy * s)
    const dy = sy - oy;
    const denom = c * P - dy * s;
    if (Math.abs(denom) < 1e-6) return { x: sx, y: sy }; // degenerate; bail
    const ly = (dy * P) / denom;

    // k that maps cx -> sx is the same k as for sy:
    //   k = P / (P - rz) = P / (P + ly*s)
    const k = P / (P + ly * s);
    const cx = ox + (sx - ox) / k;
    const cy = oy + ly;
    return { x: cx, y: cy };
  }

  // ---------------------------------------------------------------------------
  // Phaser pointer patch.
  //
  // Phaser computes pointer.x/y from `clientX - canvasRect.left`. When the
  // canvas has a CSS perspective transform, `canvasRect` is the *visual*
  // bounding box, so the math is wrong on every axis.
  //
  // Fix: listen on the canvas at capture phase, read `event.offsetX/Y` (which
  // the browser correctly hit-tests against the un-transformed element), scale
  // to the canvas's internal resolution, and write into Phaser's active
  // pointer before its own listeners run.
  // ---------------------------------------------------------------------------
  function patchPhaserPointer(phaserGame) {
    if (!Perspective.enabled) return; // nothing to do in Phase 0
    const canvas = phaserGame.canvas;

    const handler = (e) => {
      if (e.target !== canvas) return;
      const scaleX = canvas.width  / canvas.clientWidth;
      const scaleY = canvas.height / canvas.clientHeight;
      const gx = e.offsetX * scaleX;
      const gy = e.offsetY * scaleY;

      // offsetX/Y already account for the CSS transform via hit-testing, so
      // these ARE the canvas-local coords. No further unproject needed.
      const im = phaserGame.input.manager;
      const ptr = im.mousePointer || im.pointers[0];
      if (ptr) {
        ptr.x = gx; ptr.y = gy;
        ptr.worldX = gx; ptr.worldY = gy;
      }
    };

    ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']
      .forEach(ev => canvas.addEventListener(ev, handler, { capture: true }));
  }

  const exported = {
    BOARD,
    gridToWorld, worldToGrid, whichSide,
    benchSlotAt, benchSlotCenter,
    Perspective, project, unproject, patchPhaserPointer
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  } else {
    Object.assign(global, exported);
  }
})(typeof window !== 'undefined' ? window : globalThis);