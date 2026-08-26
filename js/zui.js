/* ---- zui engine ----------------------------------------------------------
   One depth axis for the whole page. Layers declare data-z in depth units
   (1du = 60px); the engine gives each its translateZ once, then per frame
   runs two springs — rig tilt toward the pointer, and the focal plane
   toward wherever focus was last sent — and writes depth-of-field blur and
   dim onto every layer from its distance to that plane. Everything else
   (the rail, the slider, the readout, the canvas specimen) reads the same
   two numbers, which is what keeps the scene feeling like one instrument. */

(() => {
  "use strict";

  const UNIT = 60;            // px per depth unit
  const PERSP = 1100;         // must match .zui-stage perspective
  const TILT_MAX = { x: 5, y: 3.2 };  // deg
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const stage = document.querySelector(".zui-stage");
  const rig = document.querySelector(".zui-rig");
  const layers = [...document.querySelectorAll(".zui-layer[data-z]")]
    .map(el => ({ el, z: parseFloat(el.dataset.z) * UNIT, blur: -1, dim: -1 }));

  for (const l of layers) l.el.style.setProperty("--zpx", l.z + "px");

  const state = {
    t: 0,
    focus: 0, focusTarget: 0,
    tilt: { x: 0, y: 0 }, tiltTarget: { x: 0, y: 0 },
  };
  const frameHooks = [];

  /* ---- pointer -> rig tilt ---------------------------------------------- */
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
    const el = e.target.closest(".zui-layer[data-focusable]");
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

  /* ---- the depth rail ---------------------------------------------------
     Built from the registry so it can never disagree with the scene. Near
     is up. Every focusable layer gets a tick; the marker is the plane. */
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

  const marker = document.createElement("div");
  marker.className = "marker";
  rail.appendChild(marker);

  /* ---- readout ---------------------------------------------------------- */
  const ro = {
    focus: document.getElementById("ro-focus"),
    tilt: document.getElementById("ro-tilt"),
    plane: document.getElementById("ro-plane"),
  };
  let roClock = 0;

  /* ---- frame loop ------------------------------------------------------- */
  const kTilt = reduced ? 1 : 0.07;
  const kFocus = reduced ? 1 : 0.085;
  let last = performance.now();

  function frame(now) {
    const dt = Math.min(50, now - last); last = now;
    state.t += dt / 1000;
    // spring gains are tuned for 60fps; scale toward the same settle at any rate
    const g = dt / 16.7;
    state.tilt.x += (state.tiltTarget.x - state.tilt.x) * kTilt * g;
    state.tilt.y += (state.tiltTarget.y - state.tilt.y) * kTilt * g;
    state.focus += (state.focusTarget - state.focus) * kFocus * g;

    rig.style.transform =
      `rotateX(${(-state.tilt.y).toFixed(3)}deg) rotateY(${state.tilt.x.toFixed(3)}deg)`;

    for (const l of layers) {
      const d = Math.abs(l.z - state.focus) / UNIT;
      const blur = Math.min(8, Math.max(0, d - 0.55) * 1.9);
      const dim = Math.max(0.52, 1 - Math.max(0, d - 0.35) * 0.11);
      if (Math.abs(blur - l.blur) > 0.05) {
        l.el.style.setProperty("--dof-blur", blur.toFixed(2) + "px"); l.blur = blur;
      }
      if (Math.abs(dim - l.dim) > 0.01) {
        l.el.style.setProperty("--dof-dim", dim.toFixed(3)); l.dim = dim;
      }
    }

    marker.style.top = railY(state.focus) + "%";
    if (!sliderHeld) slider.value = String(Math.round(state.focusTarget));

    if ((roClock += dt) > 110) {
      roClock = 0;
      const du = state.focus / UNIT;
      ro.focus.textContent = (du >= 0 ? "+" : "") + du.toFixed(2) + " du";
      ro.tilt.textContent =
        state.tilt.x.toFixed(1) + "° / " + state.tilt.y.toFixed(1) + "°";
      ro.plane.textContent = Math.round(state.focus) + " px";
    }

    for (const fn of frameHooks) fn(state);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* ---- boot: far layers materialise first ------------------------------- */
  addEventListener("load", () => setTimeout(() => {
    document.body.classList.remove("booting");
    const top = Math.max(...zs);
    for (const l of layers) {
      if (!l.el.classList.contains("holopanel")) continue;
      l.el.style.setProperty("--boot-delay",
        Math.round((top - l.z) / UNIT * 85) + "ms");
      l.el.classList.add("is-in");
      // the resting state equals the final frame, so dropping the class
      // afterwards changes nothing visible — but it hands transform back
      // to the hover transition, which an animation fill would outrank
      l.el.addEventListener("animationend",
        () => l.el.classList.remove("is-in"), { once: true });
    }
  }, reduced ? 60 : 620));

  window.ZUI = {
    UNIT, PERSP,
    get focus() { return state.focus; },
    get tilt() { return state.tilt; },
    get time() { return state.t; },
    setFocus,
    onFrame(fn) { frameHooks.push(fn); },
  };
})();
