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
  //   Phase 2: 5×7 grid per side, canvas 1000×600, standing cards on flat tiles.
  // ---------------------------------------------------------------------------
  const BOARD = {
    COLS: 5,
    ROWS: 7,
    CELL: 60,
    P1: { x: 130, y: 80 },                   // left grid starts here
    P2: { x: 580, y: 80 },                   // right grid starts here
    BENCH: { x: 20, y: 80, w: 80, slots: 7 } // vertical, left of P1
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
    canvasW: 1000,        // keep in sync with Phaser config
    canvasH: 600
  };

  function _rot() {
    const a = Perspective.angleDeg * Math.PI / 180;
    return { s: Math.sin(a), c: Math.cos(a) };
  }

  // Canvas pixel -> screen pixel (on the visually tilted board).
  // Matches CSS `perspective(P) rotateX(angle)`: bottom of the canvas
  // (ly > 0) rotates TOWARD the viewer (positive z), so it ends up enlarged
  // and pushed further away from center after the perspective divide.
  function project(cx, cy) {
    if (!Perspective.enabled) return { x: cx, y: cy };
    const P = Perspective.perspective;
    const { s, c } = _rot();
    const ox = Perspective.canvasW / 2;
    const oy = Perspective.canvasH / 2;

    // Translate to origin, rotate around X axis, then perspective divide.
    const ly = cy - oy;
    const ry = ly * c;       // rotated y
    const rz = ly * s;       // rotated z (positive = toward camera, CSS +z)
    const k  = P / (P - rz); // perspective factor: >1 toward camera, <1 away

    return {
      x: ox + (cx - ox) * k,
      y: oy + ry * k
    };
  }

  // Screen pixel -> canvas pixel. Inverse of `project`.
  // From project():  dy = ly * c * P / (P - ly*s)
  //   dy * (P - ly*s) = ly * c * P
  //   dy*P = ly * (c*P + dy*s)
  //   ly   = dy * P / (c*P + dy*s)
  // Then k = P / (P - ly*s) and cx = ox + (sx - ox)/k.
  function unproject(sx, sy) {
    if (!Perspective.enabled) return { x: sx, y: sy };
    const P = Perspective.perspective;
    const { s, c } = _rot();
    const ox = Perspective.canvasW / 2;
    const oy = Perspective.canvasH / 2;

    const dy = sy - oy;
    const denom = c * P + dy * s;
    if (Math.abs(denom) < 1e-6) return { x: sx, y: sy }; // degenerate; bail
    const ly = (dy * P) / denom;
    const k  = P / (P - ly * s);
    const cx = ox + (sx - ox) / k;
    const cy = oy + ly;
    return { x: cx, y: cy };
  }

  // ---------------------------------------------------------------------------
  // CELL HELPERS — projected quads, screen-space hit-test, depth scale.
  //
  // With Phase-2 "standing cards", the board itself is rendered tilted via
  // project(), but the units don't tilt with it — they're upright billboards
  // placed at each cell's projected screen center. Three helpers:
  //
  //   cellQuad(col, row, side)        4 screen-space corners of the cell.
  //                                   Use as a polygon hit-area for the unit
  //                                   sitting on that cell, or to stroke the
  //                                   cell outline as a trapezium.
  //   screenToCell(x, y, side)        Inverse of cellQuad — given a click in
  //                                   canvas-local screen coords, return
  //                                   {col, row, side} or null.
  //   cellRenderInfo(col, row, side)  Projected center + depth scale (k) at
  //                                   the cell. Place the unit container at
  //                                   `screen` and setScale(`scale`) to make
  //                                   back-row units look further away.
  // ---------------------------------------------------------------------------
  function _boardOrigin(side) { return side === 'p2' ? BOARD.P2 : BOARD.P1; }

  function cellQuad(col, row, side) {
    const o = _boardOrigin(side);
    const x0 = o.x + col * BOARD.CELL;
    const y0 = o.y + row * BOARD.CELL;
    const x1 = x0 + BOARD.CELL;
    const y1 = y0 + BOARD.CELL;
    return [
      project(x0, y0),
      project(x1, y0),
      project(x1, y1),
      project(x0, y1)
    ];
  }

  // Point-in-convex-quad via cross-product sign. Projected squares stay
  // convex under perspective+rotateX so this is sufficient.
  function pointInQuad(px, py, quad) {
    let sign = 0;
    for (let i = 0; i < 4; i++) {
      const a = quad[i];
      const b = quad[(i + 1) % 4];
      const cross = (b.x - a.x) * (py - a.y) - (b.y - a.y) * (px - a.x);
      if (cross === 0) continue;
      const cs = cross > 0 ? 1 : -1;
      if (sign === 0) sign = cs;
      else if (cs !== sign) return false;
    }
    return true;
  }

  function screenToCell(x, y, side) {
    for (let r = 0; r < BOARD.ROWS; r++) {
      for (let c = 0; c < BOARD.COLS; c++) {
        if (pointInQuad(x, y, cellQuad(c, r, side))) {
          return { col: c, row: r, side };
        }
      }
    }
    return null;
  }

  function cellRenderInfo(col, row, side) {
    const o = _boardOrigin(side);
    const cx = o.x + col * BOARD.CELL + BOARD.CELL / 2;
    const cy = o.y + row * BOARD.CELL + BOARD.CELL / 2;
    const screen = project(cx, cy);
    if (!Perspective.enabled) return { screen, scale: 1 };
    const { s } = _rot();
    const oy = Perspective.canvasH / 2;
    const rz = (cy - oy) * s;
    const P  = Perspective.perspective;
    const scale = P / (P - rz);
    return { screen, scale };
  }

  // ---------------------------------------------------------------------------
  // Phaser pointer patch.
  //
  // Problem: Phaser's internal `transformPointer` computes pointer.x/y as
  //   pointer.x = (event.pageX - canvas.getBoundingClientRect().left) * scale
  // and `event.offsetX` is similarly `clientX - boundingRect.left`. Both use
  // the canvas's LAYOUT box (un-transformed), so for a canvas inside a parent
  // with `transform: perspective(900) rotateX(28deg)` the click coordinate
  // ends up at the un-tilted grid position — clicking the visual card misses,
  // clicking where the un-tilted card would have been registers.
  //
  // Fix: explicitly un-project clientX/Y through the inverse perspective
  // transform. The canvas is centered in its transformed parent, so the
  // parent's rotation pivot (transform-origin: 50% 50%) coincides with the
  // canvas's center — and that pivot point is the only thing rotation leaves
  // alone. We get the canvas's pre-transform viewport box by walking the
  // `offsetParent` chain (offsetLeft/Top are layout-only, ignore transforms).
  // Then we compute the click's screen-space offset from the pivot, scale to
  // internal canvas pixels, and feed it to `unproject()`.
  // ---------------------------------------------------------------------------
  function patchPhaserPointer(phaserGameOrScene) {
    if (!Perspective.enabled) return; // nothing to do in Phase 0

    // Accept either a Phaser.Game or a Phaser.Scene. In Phaser 3.60:
    //   game.input  === InputManager (no .manager property)
    //   scene.input === InputPlugin (has .manager → InputManager)
    // The original shipped code used `phaserGame.input.manager`, which is
    // undefined when called with a Game — so the override was silently
    // failing to install. Probe robustly.
    const candidates = [
      phaserGameOrScene && phaserGameOrScene.input && phaserGameOrScene.input.manager,
      phaserGameOrScene && phaserGameOrScene.input
    ];
    const im = candidates.find(x => x && typeof x.transformPointer === 'function');
    if (!im) {
      console.warn('[coords] patchPhaserPointer: could not find InputManager.transformPointer — pointer un-projection NOT installed');
      return;
    }
    const canvas = im.canvas || (phaserGameOrScene.canvas) || im.game.canvas;
    if (!canvas) {
      console.warn('[coords] patchPhaserPointer: no canvas reachable from InputManager');
      return;
    }
    const origTransform = im.transformPointer.bind(im);

    // Un-transformed viewport box of the canvas. offsetLeft/Top walk the
    // layout tree, ignoring CSS transforms — exactly what we need.
    function layoutBox() {
      let x = 0, y = 0;
      let cur = canvas;
      while (cur) {
        x += cur.offsetLeft;
        y += cur.offsetTop;
        cur = cur.offsetParent;
      }
      return {
        left:   x - window.scrollX,
        top:    y - window.scrollY,
        width:  canvas.offsetWidth,
        height: canvas.offsetHeight
      };
    }

    im.transformPointer = function (pointer, pageX, pageY, wasMove) {
      const event = pointer.event;
      if (!event || typeof event.clientX !== 'number') {
        return origTransform(pointer, pageX, pageY, wasMove);
      }
      const box = layoutBox();
      const scaleX = canvas.width  / box.width;
      const scaleY = canvas.height / box.height;
      // click offset from canvas's un-transformed center (= rotation pivot)
      const dxCSS = event.clientX - (box.left + box.width  / 2);
      const dyCSS = event.clientY - (box.top  + box.height / 2);
      // scale to canvas-internal pixels and translate into canvas-local space
      const sx = canvas.width  / 2 + dxCSS * scaleX;
      const sy = canvas.height / 2 + dyCSS * scaleY;
      // un-project through the perspective+rotateX to recover canvas-local pixel
      const pre = unproject(sx, sy);

      const p0 = pointer.position;
      const p1 = pointer.prevPosition;
      p1.x = p0.x;
      p1.y = p0.y;
      p0.x = pre.x;
      p0.y = pre.y;
      pointer.x = pre.x;
      pointer.y = pre.y;
      pointer.worldX = pre.x;
      pointer.worldY = pre.y;
      pointer.deltaX = wasMove ? p0.x - p1.x : 0;
      pointer.deltaY = wasMove ? p0.y - p1.y : 0;
    };

    console.log('[coords] patchPhaserPointer installed; perspective un-projection active');
  }

  const exported = {
    BOARD,
    gridToWorld, worldToGrid, whichSide,
    benchSlotAt, benchSlotCenter,
    Perspective, project, unproject, patchPhaserPointer,
    cellQuad, pointInQuad, screenToCell, cellRenderInfo
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  } else {
    Object.assign(global, exported);
  }
})(typeof window !== 'undefined' ? window : globalThis);