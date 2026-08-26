# zui — z-dimension mapped hologram UI

A HUD where every element holds a real coordinate on one shared depth axis —
the DOM panels and the points inside the canvas specimen alike. Open
`index.html` (any static server, or the file directly) and rack the focal
plane through the scene.

Built on the [scifi-ui](https://amyleesterling.github.io/scifi-ui/) design
language (tokens, holopanel surface, holobar rail), in the spirit of the
[somatotopy HUD](https://amyleesterling.github.io/human-brain/somatotopy.html?areas=every&area=4&hemi=L&conn=1&surf=0).
No dependencies: plain CSS 3D + Canvas 2D.

## The idea

Depth in most "3D-ish" UIs is faked per element — a drop shadow here, a
parallax trick there — so nothing agrees on where anything is. Here depth is
a single mapped coordinate:

- **One axis.** Every layer declares `data-z` in depth units (`1du = 60px`).
  The engine gives it a real `translateZ` inside one perspective rig, and the
  canvas specimen projects its points with the same perspective constant, so
  a panel at `+1du` and a point at `+1du` are at the same depth.
- **Felt, not painted.** A pointer-driven, spring-damped rig tilt parallaxes
  every layer by exactly its own depth — no per-layer math, `preserve-3d`
  does it.
- **A focal plane.** One global focus value (its own spring). Each frame,
  every layer gets depth-of-field blur and dimming from its distance to the
  plane; the specimen's points bloom into bokeh by the same distance. Click
  a panel and focus dives to *its* depth; drag the slider to rack focus
  through the whole scene; `[` / `]` nudge it.
- **The map is legible.** A fixed depth rail (the "z map") shows every layer
  as a tick and the focal plane as a glowing marker; each panel wears its
  coordinate as a `Z +1.0` tag.

## Anatomy

| file | role |
| --- | --- |
| `css/zui.css` | tokens, stage/rig, layer DoF plumbing, holopanel surface, depth rail, placement |
| `js/zui.js` | the engine: tilt + focus springs, per-layer DoF, rail, boot sequence, `window.ZUI` |
| `js/specimen.js` | dependency-free point-cloud brain with signal cables, drawn in the engine's depth units |

Smoothness comes from three places: the two springs (nothing snaps, every
input decays through the same easing), depth staggering on boot (far layers
materialise first), and DoF written as CSS variables so blur/dim ride the
compositor-friendly `filter`/`opacity` path.

Two traps worth knowing if you build on this:

- The rig is a full-viewport plane at `z = 0`; it must be
  `pointer-events: none` or it occludes hit-testing for every layer behind it.
- The stage must be `overflow: clip`, not `hidden` — focusing a control
  inside a 3D-offset panel otherwise lets the browser scroll the stage to
  "reveal" it, shearing the whole scene sideways.
