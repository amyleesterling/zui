# zui — z-dimension mapped hologram UI

**Live demo: <https://amyleesterling.github.io/zui/>**

A HUD that is a dynamic organization, mathematically — in x, y **and** z.
Rack the focal plane through the scene, toggle units off the roster to watch
the others negotiate for their territory, and pick a fibre bundle to walk.
The brain stays in focus throughout — that is the point of the depth axis.
(Locally: open `index.html` from any static server, or directly.)

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

## Depth (z), and the subject that holds it

Every layer declares `data-z` in depth units (`1du = 60px`) and sits at a
real `translateZ` inside one perspective rig. A spring-damped pointer tilt
gives parallax; a global focal plane (its own spring) drives per-layer
depth-of-field blur and dimming, asymmetric like eyes focused near — full
strength *behind* the plane, gentle in front. A fixed depth rail maps every
layer as a tick and the focal plane as a glowing marker.

**The subject never blurs.** The depth axis exists to fit more chrome into
the HUD without burying what the HUD is about, so the specimen is marked
`data-subject` and is exempt from the focal plane entirely: panels recede,
the brain stays sharp. Depth inside the specimen is carried by its own cues
instead — perspective scale and near/far brightness — so the far side of the
cortex still sits behind the near side without any of it going soft.

**Operating a panel focuses it.** Reaching for a control you cannot read is
the failure this depth axis invites: the chrome recedes to make room, and
then you go to use some of it. Any interaction inside a unit — a click, or a
control taking keyboard focus — racks the plane to that unit, so it is sharp
by the time you act on it. The slider, the Near/Mid/Far jumps and `[` / `]`
still drive the plane directly.

## The specimen is real

The surface is the **HCP S1200 group-average midthickness cortex** (Van
Essen et al., NeuroImage 80:62, 2013; 32k fs_LR), and the pathways threading
it are the **HCP1065 population-averaged tractography** (Yeh, *Nat Commun*
13:4933, 2022; 1,065 subjects, CC-BY-SA 4.0) — both baked from the data
published on
[amyleesterling.github.io/human-brain](https://amyleesterling.github.io/human-brain/)
into `js/brainpoints.js` and `js/tracts.js`.

Both files carry the *same* transform (MNI millimetres, recentred on the
cortex centroid, over its half-extent), which is what lands each bundle
inside the surface exactly where it was measured. Glasser HCP-MMP1 labels
tint M1 (area 4) gold and S1 (3a/3b/1/2) green, the same regions the
somatotopy HUD paints. The six bundles are chosen to tell that story:
**CST** is M1's motor output and **ML** is S1's touch input — the two halves
of the sensorimotor loop — alongside the callosal crossing, arcuate,
fronto-occipital and uncinate. A light walks the active bundle, station by
station.

**Reconciling the two systems**: perspective would break the flow's
no-overlap guarantee (near panels render bigger, off-center deep panels
slide toward the vanishing point), so each unit carries a counter-scale
`(P − z)/P` and a counter-translate `t = −(c − o)·z/P`, recomputed from
the ledger after every layout change. At rest, apparent boxes equal flow
boxes exactly; depth reads through parallax, focus, and boot order.

## Verified

`node test/sweep.js` (needs `playwright-core` and a Chromium) runs a
rect-intersection sweep across every unit-visibility state × 7 widths
(1440 down to 300) × 2 scroll positions: **1,036 pair checks, zero
overlaps**.

It checks the fixed chrome, not just the units, and it checks mid-scroll as
well as at rest — because the two bugs that shipped past a units-only,
rest-only sweep were exactly there: the roster is pinned to the glass while
the stage scrolls beneath it, and the perspective compensation is measured
against a viewport-fixed origin, so scrolling silently invalidates it.

## Anatomy

| file | role |
| --- | --- |
| `css/zui.css` | tokens, stage/rig, docks, unit transform stack, holopanel surface, depth rail |
| `js/zui.js` | the engine: tilt + focus springs, DoF, area ledger, FLIP territory springs, particles, perspective compensation, `window.ZUI` |
| `js/brainpoints.js` | the baked HCP S1200 surface: ~2.7k quantised points + M1/S1 labels |
| `js/tracts.js` | the baked HCP1065 bundles: 6 pathways, 34 streamlines each |
| `js/specimen.js` | dependency-free renderer for the surface points and signal cables, drawn in the engine's depth units |
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
- Perspective compensation is measured against the viewport-fixed
  perspective origin, so it must be recomputed on scroll, not only on
  relayout and resize.
- Keep the specimen canvas *outside* the `preserve-3d` rig. Within it, every
  repaint of the canvas re-renders the whole 3D subtree — blurred panels and
  the full-viewport backdrop included — which cost about two thirds of the
  frame rate. Outside, it is flown over the specimen unit's projected box and
  loses nothing, because the rig tilt already feeds its own projection.
- Blur is charged per pixel: never blur a full-viewport element every frame.
  The backdrop recedes by dimming alone and looks the same.
