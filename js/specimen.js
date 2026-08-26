/* ---- specimen: cortex point field ---------------------------------------
   A hand-rolled point-cloud brain with signal cables, no libraries. The
   point it exists to make: the canvas is not a picture inside a panel, it
   is more of the same space. Points are projected with the engine's own
   perspective constant, their depth is measured in the engine's px, and
   the same focal plane that blurs the panels racks focus through the
   cloud — near points bloom into bokeh while the mid-plane stays sharp. */

(() => {
  "use strict";

  const canvas = document.getElementById("specimen-canvas");
  const ctx = canvas.getContext("2d");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let W = 0, H = 0, DPR = 1;
  function resize() {
    DPR = Math.min(2, devicePixelRatio || 1);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  /* deterministic PRNG so the same cloud boots every visit */
  let seed = 20260826;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

  /* ---- the cloud: two wrinkled ellipsoid hemispheres -------------------- */
  const N = 1500;
  const pts = [];
  for (let i = 0; i < N; i++) {
    const s = i % 2 ? 1 : -1;               // hemisphere
    // gaussian-ish direction
    let x = 0, y = 0, z = 0, m = 0;
    do {
      x = rnd() * 2 - 1; y = rnd() * 2 - 1; z = rnd() * 2 - 1;
      m = x * x + y * y + z * z;
    } while (m > 1 || m < 1e-4);
    m = Math.sqrt(m); x /= m; y /= m; z /= m;
    if (x * s < 0.06) { i--; continue; }    // keep to its own side, leave the fissure
    // gyri: shallow radial wrinkles over the shell
    const wr = 1 - 0.06 * Math.abs(Math.sin(6 * y + 4 * z) * Math.sin(5 * x - 3 * z));
    pts.push({
      x: (x * 0.55 * wr + s * 0.10),
      y: y * 0.46 * wr * (y < 0 ? 1 : 0.86),  // flatter on top
      z: z * 0.78 * wr,
      tone: rnd(),
    });
  }

  /* ---- signal cables: arcs through the interior ------------------------- */
  const CABLES = 5;
  const cables = [];
  for (let c = 0; c < CABLES; c++) {
    let a, b, tries = 0;
    do {
      a = pts[(rnd() * pts.length) | 0];
      b = pts[(rnd() * pts.length) | 0];
      tries++;
    } while (tries < 40 &&
      Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 0.85);
    cables.push({ a, b, phase: rnd(), speed: 0.10 + rnd() * 0.10 });
  }
  let activeCable = 0;

  /* the walks list drives cable selection */
  const walkBtns = [...document.querySelectorAll(".walks button")];
  walkBtns.forEach((btn, i) => btn.addEventListener("click", () => {
    activeCable = i % CABLES;
    for (const b of walkBtns) b.setAttribute("aria-pressed", String(b === btn));
  }));
  if (walkBtns[0]) walkBtns[0].setAttribute("aria-pressed", "true");

  const roSignals = document.getElementById("ro-signals");
  const roPoints = document.getElementById("ro-points");
  if (roPoints) roPoints.textContent = pts.length + " pts";
  if (roSignals) roSignals.textContent = CABLES + " routes";

  /* ---- projection, shared constants ------------------------------------- */
  const BEAM = "178,216,248", ACCENT = "62,150,240";

  function draw(state) {
    const P = ZUI.PERSP, UNIT = ZUI.UNIT, f = ZUI.focus;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";

    const S = Math.min(W, H) * 0.62;
    const cx = W / 2, cy = H / 2 + H * 0.02;
    const yaw = (reduced ? 0.9 : state.t * 0.14) + state.tilt.x * 0.03;
    const pitch = -0.16 + state.tilt.y * 0.02;
    const cyaw = Math.cos(yaw), syaw = Math.sin(yaw);
    const cpit = Math.cos(pitch), spit = Math.sin(pitch);

    // model space -> engine space, depth in the same px the panels use
    function proj(p) {
      let x = p.x * cyaw + p.z * syaw;
      let z = -p.x * syaw + p.z * cyaw;
      let y = p.y * cpit - z * spit;
      z = p.y * spit + z * cpit;
      const zpx = z * S * 0.85;
      const sc = P / (P - zpx);
      return { sx: cx + x * S * sc, sy: cy + y * S * sc, zpx, sc };
    }

    // points
    for (const p of pts) {
      const q = proj(p);
      const d = Math.abs(q.zpx - f) / UNIT;              // du from the focal plane
      const r = 0.85 * q.sc + Math.min(2.2, d * d * 0.22); // defocus -> bokeh
      const a = (0.30 + 0.38 * Math.max(0, q.zpx / S + 0.5))
        / (1 + d * d * 0.30);
      ctx.fillStyle = `rgba(${p.tone > 0.93 ? ACCENT : BEAM},${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(q.sx, q.sy, r, 0, 6.2832);
      ctx.fill();
    }

    // cables: an arc lifted through the interior, a pulse walking it
    cables.forEach((cb, i) => {
      const A = proj(cb.a), B = proj(cb.b);
      const lift = 1 + 0.35;
      const M = proj({
        x: (cb.a.x + cb.b.x) / 2 * 0.25,
        y: (cb.a.y + cb.b.y) / 2 * 0.25 - 0.12,
        z: (cb.a.z + cb.b.z) / 2 * 0.25,
      });
      const on = i === activeCable;
      ctx.strokeStyle = `rgba(${BEAM},${on ? 0.34 : 0.10})`;
      ctx.lineWidth = on ? 1.2 : 0.7;
      ctx.beginPath();
      ctx.moveTo(A.sx, A.sy);
      ctx.quadraticCurveTo(M.sx * lift - ((A.sx + B.sx) / 2) * (lift - 1),
        M.sy * lift - ((A.sy + B.sy) / 2) * (lift - 1), B.sx, B.sy);
      ctx.stroke();

      // pulse: quadratic bezier walked in screen space, depth interpolated
      const t = reduced ? 0.5 : (state.t * cb.speed + cb.phase) % 1;
      const u = 1 - t;
      const mx = M.sx * lift - ((A.sx + B.sx) / 2) * (lift - 1);
      const my = M.sy * lift - ((A.sy + B.sy) / 2) * (lift - 1);
      const px = u * u * A.sx + 2 * u * t * mx + t * t * B.sx;
      const py = u * u * A.sy + 2 * u * t * my + t * t * B.sy;
      const pz = u * A.zpx + t * B.zpx;
      const d = Math.abs(pz - f) / UNIT;
      const r = (on ? 2.4 : 1.5) + Math.min(4, d * d * 0.5);
      const a = (on ? 0.9 : 0.4) / (1 + d * d * 0.5);
      const g = ctx.createRadialGradient(px, py, 0, px, py, r * 3);
      g.addColorStop(0, `rgba(${BEAM},${a.toFixed(3)})`);
      g.addColorStop(1, `rgba(${BEAM},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, r * 3, 0, 6.2832);
      ctx.fill();
    });
  }

  ZUI.onFrame(draw);
})();
