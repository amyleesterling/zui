/* ---- specimen: cortex point field ---------------------------------------
   The real cortical surface as points — the HCP S1200 group-average
   midthickness mesh baked into js/brainpoints.js (see that file's header),
   with Glasser HCP-MMP1 labels marking M1 (area 4, gold) and S1
   (3a/3b/1/2, green), the same regions the somatotopy HUD paints. No
   libraries. The point this canvas exists to make: it is not a picture
   inside a panel, it is more of the same space. Points project with the
   engine's own perspective constant, their depth is measured in the
   engine's px, and the same focal plane that blurs the panels racks focus
   through the cloud — defocused points bloom into bokeh. */

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

  /* deterministic PRNG so the same accents light up every visit */
  let seed = 20260826;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

  /* ---- the cloud: the baked HCP surface --------------------------------- */
  const B = window.BRAINPOINTS;
  const pts = [];
  for (let i = 0; i < B.n; i++) {
    pts.push({
      x: B.xyz[i * 3] / B.q,
      y: B.xyz[i * 3 + 1] / B.q,
      z: B.xyz[i * 3 + 2] / B.q,
      roi: +B.roi[i],          // 0 cortex, 1 M1, 2 S1
      tone: rnd(),
    });
  }
  const labelled = pts.filter(p => p.roi);

  /* ---- signal cables: arcs from the sensorimotor strip ------------------ */
  const CABLES = 5;
  const cables = [];
  for (let c = 0; c < CABLES; c++) {
    const a = labelled[(rnd() * labelled.length) | 0] || pts[(rnd() * pts.length) | 0];
    let b, tries = 0;
    do {
      b = pts[(rnd() * pts.length) | 0];
      tries++;
    } while (tries < 60 &&
      Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 0.9);
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
  const M1C = "232,163,61", S1C = "99,184,95";  // somatotopy's gold and green

  function draw(state) {
    const P = ZUI.PERSP, UNIT = ZUI.UNIT, f = ZUI.focus;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";

    const S = Math.min(W, H) * 0.52;
    const cx = W / 2, cy = H / 2 + H * 0.02;
    const yaw = (reduced ? 0.9 : state.t * 0.14) + state.tilt.x * 0.03;
    const pitch = -0.16 + state.tilt.y * 0.02;
    const cyaw = Math.cos(yaw), syaw = Math.sin(yaw);
    const cpit = Math.cos(pitch), spit = Math.sin(pitch);
    // the canvas sits on the specimen unit's own plane, so its points'
    // depths are offsets from that plane in the shared axis
    const zBase = 1.4 * UNIT;

    // same asymmetric DoF as the panels: behind the plane at full strength,
    // in front only gently
    const dof = zpx => {
      const d = (f - zpx) / UNIT;
      return d > 0 ? d : -d * 0.45;
    };

    function proj(p) {
      let x = p.x * cyaw + p.z * syaw;
      let z = -p.x * syaw + p.z * cyaw;
      let y = p.y * cpit - z * spit;
      z = p.y * spit + z * cpit;
      const zpx = zBase + z * S * 0.55;
      const sc = P / (P - zpx);
      return { sx: cx + x * S * sc, sy: cy + y * S * sc, zpx, sc };
    }

    // points
    for (const p of pts) {
      const q = proj(p);
      const d = dof(q.zpx);                              // du from the focal plane
      const r = (p.roi ? 1.05 : 0.85) * q.sc + Math.min(2.2, d * d * 0.22);
      const a = (0.30 + 0.38 * Math.max(0, (q.zpx - zBase) / S + 0.5))
        / (1 + d * d * 0.30);
      const col = p.roi === 1 ? M1C : p.roi === 2 ? S1C
        : p.tone > 0.93 ? ACCENT : BEAM;
      ctx.fillStyle = `rgba(${col},${(p.roi ? a * 1.5 : a).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(q.sx, q.sy, r, 0, 6.2832);
      ctx.fill();
    }

    // cables: an arc lifted through the interior, a pulse walking it
    cables.forEach((cb, i) => {
      const A = proj(cb.a), B2 = proj(cb.b);
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
      ctx.quadraticCurveTo(M.sx * lift - ((A.sx + B2.sx) / 2) * (lift - 1),
        M.sy * lift - ((A.sy + B2.sy) / 2) * (lift - 1), B2.sx, B2.sy);
      ctx.stroke();

      // pulse: quadratic bezier walked in screen space, depth interpolated
      const t = reduced ? 0.5 : (state.t * cb.speed + cb.phase) % 1;
      const u = 1 - t;
      const mx = M.sx * lift - ((A.sx + B2.sx) / 2) * (lift - 1);
      const my = M.sy * lift - ((A.sy + B2.sy) / 2) * (lift - 1);
      const px = u * u * A.sx + 2 * u * t * mx + t * t * B2.sx;
      const py = u * u * A.sy + 2 * u * t * my + t * t * B2.sy;
      const pz = u * A.zpx + t * B2.zpx;
      const d = dof(pz);
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
