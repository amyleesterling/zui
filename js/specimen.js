/* ---- specimen: the subject ----------------------------------------------
   The real cortical surface as points (js/brainpoints.js) threaded by the
   real measured fibre bundles (js/tracts.js), both carrying the same MNI
   transform so the tracts run where they were actually measured.

   This canvas is the HUD's subject, and the subject holds focus. The whole
   point of the depth axis is to fit more chrome around the specimen without
   burying it, so the panels recede and blur while the brain stays sharp:
   the specimen unit is marked data-subject and the engine exempts it from
   the focal-plane depth of field. Depth inside the specimen is carried by
   its own cues instead — perspective scale, near/far brightness, and a
   gentle self-relative haze measured from the specimen's own mid-plane, so
   the far side of the brain sits behind the near side without any of it
   going soft enough to stop reading. */

(() => {
  "use strict";

  const canvas = document.getElementById("specimen-canvas");
  const ctx = canvas.getContext("2d");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* The canvas lives outside the perspective rig and is flown over the
     specimen unit's projected box, which the engine publishes once a frame.
     Inside the rig every repaint here would re-render the whole preserve-3d
     subtree, blurred panels included; out here it is on its own. */
  let W = 0, H = 0, DPR = Math.min(2, devicePixelRatio || 1);
  let lx = -1, ly = -1, lw = -1, lh = -1;

  function track() {
    const r = ZUI.subjectRect;
    if (!r || r.width < 2 || r.height < 2) {
      if (canvas.style.display !== "none") canvas.style.display = "none";
      return false;
    }
    if (canvas.style.display === "none") canvas.style.display = "";
    const x = Math.round(r.x), y = Math.round(r.y);
    const w = Math.round(r.width), h = Math.round(r.height);
    if (x !== lx || y !== ly) {
      canvas.style.left = x + "px"; canvas.style.top = y + "px";
      lx = x; ly = y;
    }
    if (w !== lw || h !== lh) {
      canvas.style.width = w + "px"; canvas.style.height = h + "px";
      DPR = Math.min(2, devicePixelRatio || 1);
      canvas.width = Math.round(w * DPR);
      canvas.height = Math.round(h * DPR);
      lw = w; lh = h;
    }
    W = w; H = h;
    return true;
  }

  let seed = 20260826;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

  /* ---- the cloud --------------------------------------------------------- */
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

  /* ---- the bundles ------------------------------------------------------- */
  const T = window.TRACTS;
  const bundles = T.bundles.map((b, i) => ({
    id: b.id, name: b.name, code: b.code,
    lines: b.lines, pts: b.pts, xyz: b.xyz, q: T.q,
    phase: i / T.bundles.length,
  }));
  let active = 0;

  /* the walks list is built from the bundles themselves, so the HUD can
     never name a pathway the data does not carry */
  const list = document.querySelector(".walks");
  if (list) {
    list.innerHTML = "";
    bundles.forEach((b, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.innerHTML = `<i></i>${b.name} <span class="wz">${b.code}</span>`;
      btn.setAttribute("aria-pressed", String(i === active));
      btn.title = `${b.id} — ${b.lines} sampled streamlines`;
      btn.addEventListener("click", () => {
        active = i;
        for (const el of list.children)
          el.setAttribute("aria-pressed", String(el === btn));
      });
      list.appendChild(btn);
    });
  }

  const roSignals = document.getElementById("ro-signals");
  const roPoints = document.getElementById("ro-points");
  if (roPoints) roPoints.textContent = pts.length + " pts";
  if (roSignals) roSignals.textContent = bundles.length + " bundles";

  /* ---- palette ----------------------------------------------------------- */
  const BEAM = "178,216,248", ACCENT = "62,150,240";
  const M1C = "232,163,61", S1C = "99,184,95";   // somatotopy's gold and green
  const FAMS = [BEAM, M1C, S1C, ACCENT];

  /* scratch buffer for one streamline's projection, reused every frame */
  const sx = new Float32Array(64), sy = new Float32Array(64), sz = new Float32Array(64);

  /* Batching. A per-point fillStyle write and its own beginPath/fill costs
     more than the arc itself, and there are thousands of points a frame —
     done naively this canvas runs at ~13fps. Depth here is carried by
     brightness, which is continuous, so quantise it into a few buckets:
     every point in a bucket shares one style and lands in one path, and the
     whole cloud draws in FAMS*BUCKETS fills instead of one per point. At 7
     buckets the banding is well under what the eye resolves on these dots. */
  const BUCKETS = 7;
  const bins = [];
  for (let i = 0; i < FAMS.length * BUCKETS; i++) bins.push([]);
  const styleOf = (fam, b) =>
    `rgba(${FAMS[fam]},${((b + 0.5) / BUCKETS).toFixed(3)})`;

  function bin(fam, alpha, x, y, r) {
    let b = (alpha * BUCKETS) | 0;
    if (b < 0) b = 0; else if (b >= BUCKETS) b = BUCKETS - 1;
    const a = bins[fam * BUCKETS + b];
    a.push(x, y, r);
  }

  function flushBins() {
    for (let f = 0; f < FAMS.length; f++)
      for (let b = 0; b < BUCKETS; b++) {
        const a = bins[f * BUCKETS + b];
        if (!a.length) continue;
        ctx.fillStyle = styleOf(f, b);
        ctx.beginPath();
        for (let i = 0; i < a.length; i += 3) {
          const x = a[i], y = a[i + 1], r = a[i + 2];
          // A full-circle arc is a lot of path for a dot two pixels across,
          // and thousands of them a frame is most of the draw. Below the
          // radius where a square and a disc differ on screen, use the
          // square: same picture, a fraction of the geometry.
          if (r < 1.7) ctx.rect(x - r, y - r, r + r, r + r);
          else { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, 6.2832); }
        }
        ctx.fill();
        a.length = 0;
      }
  }

  function draw(state) {
    if (!track()) return;
    const P = ZUI.PERSP;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";

    const S = Math.min(W, H) * 0.52;
    const cx = W / 2, cy = H / 2 + H * 0.02;
    const yaw = (reduced ? 0.9 : state.t * 0.14) + state.tilt.x * 0.03;
    const pitch = -0.16 + state.tilt.y * 0.02;
    const cyaw = Math.cos(yaw), syaw = Math.sin(yaw);
    const cpit = Math.cos(pitch), spit = Math.sin(pitch);
    const DEPTH = S * 0.55;          // model unit -> px along the depth axis

    /* Project into the specimen's own frame. zn is the point's depth in
       model units about the specimen's mid-plane: the only depth signal
       used in here, which is what keeps the subject independent of where
       the panels' focal plane happens to be. */
    let px = 0, py = 0, pzn = 0, psc = 1;
    function proj(X, Y, Z) {
      const x = X * cyaw + Z * syaw;
      let z = -X * syaw + Z * cyaw;
      const y = Y * cpit - z * spit;
      z = Y * spit + z * cpit;
      const zpx = z * DEPTH;
      const sc = P / (P - zpx);
      px = cx + x * S * sc; py = cy + y * S * sc; pzn = z; psc = sc;
    }

    // ---- cortex points ---------------------------------------------------
    for (const p of pts) {
      proj(p.x, p.y, p.z);
      // near points read brighter and slightly larger; far ones sit back
      // without blurring, so the shell always reads as a surface
      const near = pzn * 0.5 + 0.5;                 // 0 far .. 1 near
      const r = (p.roi ? 1.15 : 0.9) * psc;
      const a = p.roi ? 0.42 + 0.5 * near : 0.16 + 0.34 * near;
      bin(p.roi === 1 ? 1 : p.roi === 2 ? 2 : p.tone > 0.93 ? 3 : 0, a, px, py, r);
    }
    flushBins();

    // ---- fibre bundles ---------------------------------------------------
    // Strokes bucket by depth the same way the points do, so a bundle draws
    // in a handful of paths rather than one stroke per streamline.
    const t = reduced ? 0.5 : state.t;
    const strokeBins = [];
    for (let i = 0; i < BUCKETS; i++) strokeBins.push(null);

    bundles.forEach((b, bi) => {
      const on = bi === active;
      const q = b.q, N = b.pts;
      // inactive bundles thin out so the active pathway stays legible
      const step = on ? 1 : 3;

      for (let i = 0; i < BUCKETS; i++) strokeBins[i] = null;
      let pulses = 0;

      for (let l = 0; l < b.lines; l += step) {
        const base = l * N * 3;
        let zsum = 0;
        for (let k = 0; k < N; k++) {
          const o = base + k * 3;
          proj(b.xyz[o] / q, b.xyz[o + 1] / q, b.xyz[o + 2] / q);
          sx[k] = px; sy[k] = py; sz[k] = pzn;
          zsum += pzn;
        }
        const near = (zsum / N) * 0.5 + 0.5;
        const a = on ? 0.16 + 0.30 * near : 0.05 + 0.10 * near;
        let bk = (a / (on ? 0.46 : 0.15) * BUCKETS) | 0;
        if (bk < 0) bk = 0; else if (bk >= BUCKETS) bk = BUCKETS - 1;
        let path = strokeBins[bk];
        if (!path) path = strokeBins[bk] = new Path2D();
        path.moveTo(sx[0], sy[0]);
        for (let k = 1; k < N; k++) path.lineTo(sx[k], sy[k]);

        // the walk: a light travelling the fibre, station by station. Only
        // some streamlines carry one — a light on every line reads as a
        // glowing tube rather than as traffic along a pathway.
        if (!on || (l & 3)) continue;
        pulses++;
        const u = ((t * 0.22 + b.phase + l * 0.055) % 1) * (N - 1);
        const k0 = u | 0, f = u - k0, k1 = Math.min(N - 1, k0 + 1);
        const gx = sx[k0] + (sx[k1] - sx[k0]) * f;
        const gy = sy[k0] + (sy[k1] - sy[k0]) * f;
        const gn = (sz[k0] + (sz[k1] - sz[k0]) * f) * 0.5 + 0.5;
        // two stacked discs stand in for a radial gradient, which costs a
        // fresh object per pulse per frame
        const rr = 2.0 + 1.4 * gn;
        bin(0, (0.14 + 0.12 * gn), gx, gy, rr * 2.6);
        bin(0, (0.55 + 0.42 * gn), gx, gy, rr * 0.85);
      }

      ctx.lineWidth = on ? 1.15 : 0.65;
      for (let i = 0; i < BUCKETS; i++) {
        const path = strokeBins[i];
        if (!path) continue;
        ctx.strokeStyle = `rgba(${on ? BEAM : ACCENT},${
          (((i + 0.5) / BUCKETS) * (on ? 0.46 : 0.15)).toFixed(3)})`;
        ctx.stroke(path);
      }
      if (pulses) flushBins();
    });
  }

  ZUI.onFrame(draw);
})();
