/* ---- zui engine ----------------------------------------------------------
   One depth axis and one territory system for the whole page.

   Depth: layers declare data-z in depth units (1du = 60px); the engine
   gives each its translateZ once (plus a (P-z)/P counter-scale so apparent
   size matches the flow box), then per frame runs two springs — rig tilt
   toward the pointer, and the focal plane toward wherever focus was last
   sent — and writes depth-of-field blur and dim onto every layer from its
   distance to that plane.

   Territory: units live in flex docks, so nothing can overlap by
   construction. The engine keeps an area ledger (each unit's screen share
   a = wh/WH, tracked continuously). When the layout moves a unit, the
   transition is integrated as a critically damped spring
   (s'' = -w^2 s - 2w s', w = 14 rad/s — the unique damping that reaches
   rest fastest with zero overshoot; integrated in closed form so no time
   step can make it overshoot either), and the area differential each unit
   gains or loses is emitted as particles, count scaling with sqrt|dA|:
   claiming screen draws sparks inward, ceding it sheds them outward. */

(() => {
  "use strict";

  const UNIT = 60;            // px per depth unit
  const PERSP = 1100;         // must match .zui-stage perspective
  const TILT_MAX = { x: 5, y: 3.2 };  // deg
  const OMEGA = 14;           // rad/s, critical damping
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const stage = document.querySelector(".zui-stage");
  const rig = document.querySelector(".zui-rig");

  /* ---- depth registry ---------------------------------------------------- */
  const layers = [...document.querySelectorAll(".zui-layer[data-z]")]
    .map(el => ({ el, z: parseFloat(el.dataset.z) * UNIT, blur: -1, dim: -1 }));
  for (const l of layers) {
    l.el.style.setProperty("--zpx", l.z + "px");
    if (l.el.classList.contains("zui-unit"))
      l.el.style.setProperty("--zsc", ((PERSP - l.z) / PERSP).toFixed(4));
  }

  /* ---- territory registry ------------------------------------------------ */
  // spring state per scalar: value s, velocity v (closed-form critical damping)
  const spring = () => ({ s: 0, v: 0 });
  const stepSpring = (sp, dt) => {
    const B = sp.v + OMEGA * sp.s;
    const e = Math.exp(-OMEGA * dt);
    const s = (sp.s + B * dt) * e;
    sp.v = (sp.v - OMEGA * B * dt) * e;
    sp.s = s;
    return Math.abs(sp.s) > 0.05 || Math.abs(sp.v) > 0.5;
  };

  const units = [...document.querySelectorAll(".zui-unit")].map(el => ({
    el,
    key: el.dataset.unit,
    layer: layers.find(l => l.el === el),
    shareEl: el.querySelector("[data-share]"),
    fx: spring(), fy: spring(), sx: spring(), sy: spring(),
    cx: 0, cy: 0,
    animating: false,
    share: 0,
  }));
  const unitByKey = Object.fromEntries(units.map(u => [u.key, u]));

  const visible = u => !u.el.classList.contains("is-hidden");
  const rectOf = u => u.el.getBoundingClientRect();

  /* ---- perspective compensation -----------------------------------------
     The counter-scale (--zsc) keeps a unit's apparent size equal to its
     flow box, but projection also slides an off-center unit toward the
     vanishing point: screen = o + (c - o)·P/(P - z). Pre-translating by
     t = -(c - o)·z/P cancels that at rest, so the dock's no-overlap
     guarantee holds on screen. Recomputed after every layout change. */
  function compensate() {
    const ox = innerWidth * 0.5, oy = innerHeight * 0.46; // = perspective-origin
    for (const u of units) {
      if (!visible(u) || !u.layer || !u.layer.z) continue;
      const z = u.layer.z;
      const k = PERSP / (PERSP - z);
      const r = rectOf(u);
      // flow center, undoing the projection and the compensation now applied
      const cx = ox + (r.x + r.width / 2 - ox) / k - u.cx;
      const cy = oy + (r.y + r.height / 2 - oy) / k - u.cy;
      u.cx = -(cx - ox) * z / PERSP;
      u.cy = -(cy - oy) * z / PERSP;
      u.el.style.setProperty("--cx", u.cx.toFixed(2) + "px");
      u.el.style.setProperty("--cy", u.cy.toFixed(2) + "px");
    }
  }

  /* ---- area ledger ------------------------------------------------------- */
  const ro = {
    focus: document.getElementById("ro-focus"),
    tilt: document.getElementById("ro-tilt"),
    cover: document.getElementById("ro-cover"),
    delta: document.getElementById("ro-delta"),
  };

  function updateLedger() {
    // the ledger's whole is the rig's actual extent, which on small
    // screens scrolls past the viewport
    const WH = innerWidth * Math.max(innerHeight, rig.scrollHeight);
    let total = 0;
    for (const u of units) {
      const r = visible(u) ? rectOf(u) : null;
      u.share = r ? (r.width * r.height) / WH : 0;
      total += u.share;
      if (u.shareEl)
        u.shareEl.textContent = r ? (u.share * 100).toFixed(1) + "%" : "—";
    }
    if (ro.cover) ro.cover.textContent = (total * 100).toFixed(1) + "%";
  }

  /* ---- territory particles ----------------------------------------------
     Screen-space, on the glass. A burst is a unit's area differential made
     visible: claiming draws sparks inward to the unit, ceding sheds them
     outward from where it stood. */
  const pcv = document.getElementById("particles");
  const pctx = pcv.getContext("2d");
  let PW = 0, PH = 0, PDPR = 1;
  function presize() {
    PDPR = Math.min(2, devicePixelRatio || 1);
    PW = innerWidth; PH = innerHeight;
    pcv.width = Math.round(PW * PDPR); pcv.height = Math.round(PH * PDPR);
  }
  presize();
  addEventListener("resize", presize);

  const parts = [];
  function burst(rect, dir, dA) {
    if (reduced) return;
    const n = Math.min(120, Math.max(6, Math.round(Math.sqrt(Math.abs(dA)) * 0.6)));
    const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
    for (let i = 0; i < n; i++) {
      // a point on the rect perimeter
      const t = Math.random() * 2 * (rect.width + rect.height);
      let x, y;
      if (t < rect.width) { x = rect.x + t; y = rect.y; }
      else if (t < rect.width + rect.height) { x = rect.x + rect.width; y = rect.y + (t - rect.width); }
      else if (t < 2 * rect.width + rect.height) { x = rect.x + (t - rect.width - rect.height); y = rect.y + rect.height; }
      else { x = rect.x; y = rect.y + (t - 2 * rect.width - rect.height); }
      let dx = cx - x, dy = cy - y;
      const m = Math.hypot(dx, dy) || 1;
      const sp = (dir > 0 ? 90 : 130) * (0.5 + Math.random());
      dx = dx / m * sp * dir; dy = dy / m * sp * dir;
      parts.push({
        x, y, vx: dx, vy: dy,
        age: 0, life: 0.45 + Math.random() * 0.45,
        r: 0.7 + Math.random() * 1.3,
      });
    }
  }

  function drawParticles(dt) {
    pctx.setTransform(PDPR, 0, 0, PDPR, 0, 0);
    pctx.clearRect(0, 0, PW, PH);
    if (!parts.length) return;
    pctx.globalCompositeOperation = "lighter";
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age += dt;
      if (p.age >= p.life) { parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.965; p.vy *= 0.965;
      const a = (1 - p.age / p.life) * 0.85;
      pctx.fillStyle = `rgba(178,216,248,${a.toFixed(3)})`;
      pctx.beginPath();
      pctx.arc(p.x, p.y, p.r, 0, 6.2832);
      pctx.fill();
    }
  }

  /* ---- FLIP relayout ------------------------------------------------------
     Snapshot where every unit is, mutate the flow, snapshot where it landed,
     then hand the difference to the springs and the area differential to
     the particles. */
  let lastDelta = null;
  function relayout(mutate) {
    const prev = new Map();
    for (const u of units) prev.set(u, visible(u) ? rectOf(u) : null);

    mutate();

    // measure the new layout clean of any in-flight spring offsets
    for (const u of units) {
      u.fx.s = u.fy.s = u.sx.s = u.sy.s = 0;
      u.fx.v = u.fy.v = u.sx.v = u.sy.v = 0;
      writeSpring(u);
      u.animating = false;
    }
    void rig.offsetWidth;
    compensate();

    let biggest = null;
    for (const u of units) {
      const a = prev.get(u);
      const b = visible(u) ? rectOf(u) : null;
      const areaA = a ? a.width * a.height : 0;
      const areaB = b ? b.width * b.height : 0;
      const dA = areaB - areaA;
      if (!biggest || Math.abs(dA) > Math.abs(biggest.dA)) biggest = { u, dA };

      if (a && b) {
        // spring from the old visual box to the new one
        u.fx.s = (a.x + a.width / 2) - (b.x + b.width / 2);
        u.fy.s = (a.y + a.height / 2) - (b.y + b.height / 2);
        u.sx.s = a.width / b.width - 1;
        u.sy.s = a.height / b.height - 1;
        u.animating = true;
        writeSpring(u);
        if (Math.abs(dA) > 900) burst(b, dA > 0 ? 1 : -1, dA);
      } else if (!a && b) {
        u.sx.s = u.sy.s = -0.14;       // a small pop as it claims its seat
        u.animating = true;
        writeSpring(u);
        burst(b, 1, areaB);
      } else if (a && !b) {
        burst(a, -1, -areaA);
      }
    }

    if (biggest && Math.abs(biggest.dA) > 900) {
      const WH = innerWidth * Math.max(innerHeight, rig.scrollHeight);
      lastDelta = (biggest.dA > 0 ? "+" : "−") +
        (Math.abs(biggest.dA) / WH * 100).toFixed(1) + "% " + biggest.u.key;
      if (ro.delta) ro.delta.textContent = lastDelta;
    }
    updateLedger();
    updateRailVisibility();
  }

  function writeSpring(u) {
    u.el.style.setProperty("--fx", u.fx.s.toFixed(2) + "px");
    u.el.style.setProperty("--fy", u.fy.s.toFixed(2) + "px");
    u.el.style.setProperty("--fsx", (1 + u.sx.s).toFixed(4));
    u.el.style.setProperty("--fsy", (1 + u.sy.s).toFixed(4));
  }

  /* ---- unit roster ------------------------------------------------------- */
  for (const btn of document.querySelectorAll(".unitbar button[data-toggle]")) {
    btn.addEventListener("click", () => {
      const u = unitByKey[btn.dataset.toggle];
      if (!u) return;
      relayout(() => u.el.classList.toggle("is-hidden"));
      btn.setAttribute("aria-pressed", String(visible(u)));
      if (!visible(u) && focusedLayer === u.layer) setFocus(0, null);
    });
  }

  addEventListener("resize", () => { compensate(); updateLedger(); });
  compensate();

  /* ---- pointer -> rig tilt ---------------------------------------------- */
  // focus rests on the nearest working plane (the specimen), so at rest the
  // closest thing is sharpest and blur grows with distance behind it
  const FOCUS_HOME = 1.4 * UNIT;
  const state = {
    t: 0,
    focus: FOCUS_HOME, focusTarget: FOCUS_HOME,
    tilt: { x: 0, y: 0 }, tiltTarget: { x: 0, y: 0 },
  };
  const frameHooks = [];

  addEventListener("pointermove", e => {
    if (reduced) return;
    const nx = e.clientX / innerWidth - 0.5;
    const ny = e.clientY / innerHeight - 0.5;
    state.tiltTarget.x = nx * 2 * TILT_MAX.x;
    state.tiltTarget.y = ny * 2 * TILT_MAX.y;
  });
  addEventListener("pointerleave", () => {
    state.tiltTarget.x = 0; state.tiltTarget.y = 0;
  });

  /* ---- focus ------------------------------------------------------------ */
  let focusedLayer = null;
  function setFocus(zpx, layer) {
    state.focusTarget = Math.max(-260, Math.min(200, zpx));
    if (focusedLayer) focusedLayer.el.classList.remove("is-focused");
    focusedLayer = layer || null;
    if (focusedLayer) focusedLayer.el.classList.add("is-focused");
    for (const t of railTicks) t.btn.classList.toggle("is-focused", t.layer === focusedLayer);
    for (const b of jumpBtns)
      b.setAttribute("aria-pressed", String(Math.abs(+b.dataset.f * UNIT - state.focusTarget) < 1));
  }

  stage.addEventListener("click", e => {
    // a click on a control inside a panel is that control's, not the panel's
    if (e.target.closest("button, input, a")) return;
    const el = e.target.closest(".zui-unit[data-focusable]");
    if (!el) return;
    const layer = layers.find(l => l.el === el);
    if (layer) setFocus(layer.z, layer);
  });

  addEventListener("keydown", e => {
    if (e.key === "[") setFocus(state.focusTarget - UNIT / 2);
    if (e.key === "]") setFocus(state.focusTarget + UNIT / 2);
  });

  const slider = document.getElementById("fplane-range");
  let sliderHeld = false;
  slider.addEventListener("input", () => { sliderHeld = true; setFocus(+slider.value); });
  slider.addEventListener("change", () => { sliderHeld = false; });

  const jumpBtns = [...document.querySelectorAll(".fjump button")];
  for (const b of jumpBtns)
    b.addEventListener("click", () => setFocus(+b.dataset.f * UNIT));

  /* ---- the depth rail ---------------------------------------------------- */
  const rail = document.querySelector(".zrail");
  const zs = layers.map(l => l.z);
  const zMax = Math.max(...zs) + 26, zMin = Math.min(...zs) - 26;
  const railY = z => (zMax - z) / (zMax - zMin) * 100;

  const railTicks = layers
    .filter(l => l.el.hasAttribute("data-focusable"))
    .map(layer => {
      const btn = document.createElement("button");
      btn.className = "tick";
      btn.style.top = railY(layer.z) + "%";
      const name = layer.el.dataset.name || "layer";
      btn.setAttribute("aria-label",
        `focus ${name} at z ${(layer.z / UNIT).toFixed(1)}du`);
      btn.title = `${name}  z ${(layer.z >= 0 ? "+" : "")}${(layer.z / UNIT).toFixed(1)}du`;
      btn.appendChild(document.createElement("i"));
      btn.addEventListener("click", () => setFocus(layer.z, layer));
      rail.appendChild(btn);
      return { btn, layer };
    });

  function updateRailVisibility() {
    for (const t of railTicks) {
      const u = units.find(u => u.layer === t.layer);
      t.btn.style.display = (u && !visible(u)) ? "none" : "";
    }
  }

  const marker = document.createElement("div");
  marker.className = "marker";
  rail.appendChild(marker);

  /* ---- frame loop -------------------------------------------------------- */
  const kTilt = reduced ? 1 : 0.07;
  const kFocus = reduced ? 1 : 0.085;
  let roClock = 0;
  let last = performance.now();

  function frame(now) {
    const dtMs = Math.min(50, now - last); last = now;
    const dt = dtMs / 1000;
    state.t += dt;
    const g = dtMs / 16.7;
    state.tilt.x += (state.tiltTarget.x - state.tilt.x) * kTilt * g;
    state.tilt.y += (state.tiltTarget.y - state.tilt.y) * kTilt * g;
    state.focus += (state.focusTarget - state.focus) * kFocus * g;

    rig.style.transform =
      `rotateX(${(-state.tilt.y).toFixed(3)}deg) rotateY(${state.tilt.x.toFixed(3)}deg)`;

    for (const l of layers) {
      // asymmetric depth of field, like eyes focused near: distance BEHIND
      // the focal plane blurs and dims at full strength, distance in front
      // of it only gently — the deepest layers are always the blurriest
      const d = (state.focus - l.z) / UNIT;   // positive = behind the plane
      const db = Math.max(0, d), df = Math.max(0, -d);
      const blur = Math.min(8, Math.max(0, db - 0.55) * 1.9 + Math.max(0, df - 0.55) * 0.8);
      const dim = Math.max(0.5,
        1 - Math.max(0, db - 0.35) * 0.11 - Math.max(0, df - 0.35) * 0.05);
      if (Math.abs(blur - l.blur) > 0.05) {
        l.el.style.setProperty("--dof-blur", blur.toFixed(2) + "px"); l.blur = blur;
      }
      if (Math.abs(dim - l.dim) > 0.01) {
        l.el.style.setProperty("--dof-dim", dim.toFixed(3)); l.dim = dim;
      }
    }

    // territory springs
    for (const u of units) {
      if (!u.animating) continue;
      const live =
        stepSpring(u.fx, dt) | stepSpring(u.fy, dt) |
        stepSpring(u.sx, dt) | stepSpring(u.sy, dt);
      if (!live) { u.fx.s = u.fy.s = u.sx.s = u.sy.s = 0; u.animating = false; }
      writeSpring(u);
    }

    drawParticles(dt);

    marker.style.top = railY(state.focus) + "%";
    if (!sliderHeld) slider.value = String(Math.round(state.focusTarget));

    if ((roClock += dtMs) > 110) {
      roClock = 0;
      const du = state.focus / UNIT;
      if (ro.focus) ro.focus.textContent = (du >= 0 ? "+" : "") + du.toFixed(2) + " du";
      if (ro.tilt) ro.tilt.textContent =
        state.tilt.x.toFixed(1) + "° / " + state.tilt.y.toFixed(1) + "°";
    }

    for (const fn of frameHooks) fn(state);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* ---- boot: far layers materialise first -------------------------------- */
  addEventListener("load", () => setTimeout(() => {
    document.body.classList.remove("booting");
    const top = Math.max(...zs);
    for (const l of layers) {
      if (!l.el.classList.contains("holopanel")) continue;
      l.el.style.setProperty("--boot-delay",
        Math.round((top - l.z) / UNIT * 85) + "ms");
      l.el.classList.add("is-in");
      // the resting state equals the final frame, so dropping the class
      // afterwards changes nothing visible — but it hands filter/opacity
      // back to the DoF variables, which an animation fill would outrank
      l.el.addEventListener("animationend",
        () => l.el.classList.remove("is-in"), { once: true });
    }
    compensate();
    updateLedger();
  }, reduced ? 60 : 620));

  window.ZUI = {
    UNIT, PERSP, OMEGA,
    get focus() { return state.focus; },
    get tilt() { return state.tilt; },
    get time() { return state.t; },
    setFocus, relayout,
    onFrame(fn) { frameHooks.push(fn); },
  };
})();
