# zui — z-dimension mapped hologram UI

A HUD that is a dynamic organization, mathematically — in x, y **and** z.
Open `index.html` (any static server, or the file directly), rack the focal
plane through the scene, and toggle units off the roster to watch the
others negotiate for their territory.

Built on the [scifi-ui](https://amyleesterling.github.io/scifi-ui/) design
language (tokens, holopanel surface, holobar rail), in the spirit of the
[somatotopy HUD](https://amyleesterling.github.io/human-brain/somatotopy.html?areas=every&area=4&hemi=L&conn=1&surf=0)
and its self-organizing dock system. No dependencies: plain CSS 3D + Canvas 2D.

## Territory (x, y)

Every unit lives in a flex dock (a top row, a main row with a side column,
a bottom row), so a unit that appears claims space in the flow and a unit
that hides gives it back; **nothing can overlap by construction**.
Underneath is an **area ledger**: each unit's screen share `a = wh/WH` is
tracked continuously — every panel wears its live share next to its depth
tag, and the readout totals coverage.

When the layout moves a unit, the transition is integrated as a
**critically damped spring** (`s'' = −ω²s − 2ωs'`, ω = 14 rad/s — the
unique damping that reaches rest fastest with zero overshoot; integrated in
closed form so no time step can make it overshoot either). The **area
differential each unit gains or loses is emitted as particles**, count
scaling with √|dA|: claiming screen draws sparks inward, ceding it sheds
them outward.

## Depth (z)

Every layer declares `data-z` in depth units (`1du = 60px`) and sits at a
real `translateZ` inside one perspective rig; the point-cloud specimen
projects with the same perspective constant, so panel depths and point
depths are one coordinate. A spring-damped pointer tilt gives parallax; a
global focal plane (its own spring) drives per-layer depth-of-field
blur/dim and per-point bokeh from the same distance. Click a panel and
focus dives to its depth; the slider racks focus through the whole scene;
`[` / `]` nudge it. A fixed depth rail maps every layer as a tick and the
focal plane as a glowing marker.

**Reconciling the two systems**: perspective would break the flow's
no-overlap guarantee (near panels render bigger, off-center deep panels
slide toward the vanishing point), so each unit carries a counter-scale
`(P − z)/P` and a counter-translate `t = −(c − o)·z/P`, recomputed from
the ledger after every layout change. At rest, apparent boxes equal flow
boxes exactly; depth reads through parallax, focus, and boot order.

## Verified

`node test/sweep.js` (needs `playwright-core` and a Chromium) runs a
rect-intersection sweep across every unit-visibility state × widths
1440/1024/700/430: **296 pair checks, zero overlaps everywhere**, including
the states where whole docks collapse and the phone width where the scene
becomes a scrolling column.

## Anatomy

| file | role |
| --- | --- |
| `css/zui.css` | tokens, stage/rig, docks, unit transform stack, holopanel surface, depth rail |
| `js/zui.js` | the engine: tilt + focus springs, DoF, area ledger, FLIP territory springs, particles, perspective compensation, `window.ZUI` |
| `js/specimen.js` | dependency-free point-cloud brain with signal cables, drawn in the engine's depth units |
| `test/sweep.js` | the zero-overlap rect-intersection sweep |

Traps worth knowing if you build on this:

- The rig is a full-viewport plane at `z = 0`; it must be
  `pointer-events: none` or it occludes hit-testing for every layer behind it.
- The stage must be `overflow: clip`, not `hidden` — focusing a control
  inside a 3D-offset panel otherwise lets the browser scroll the stage to
  "reveal" it, shearing the whole scene sideways.
- `getBoundingClientRect()` includes the 3D projection, which is what lets
  the sweep test the *apparent* geometry — but it also means FLIP snapshots
  must be taken after springs are cleared and compensation reapplied.
