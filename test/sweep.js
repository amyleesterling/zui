/* Rect-intersection sweep: asserts that no two visible units overlap, at
   rest, across every unit-visibility state and a range of widths. This is
   the check that keeps the dock system honest — the flow guarantees layout
   boxes can't overlap, and the perspective counter-scale/counter-translate
   must keep that true for the *apparent* boxes too.

   Run: npm i playwright-core && node test/sweep.js
   (Set CHROMIUM to a chromium binary path if the default isn't present.) */
const { chromium } = require('playwright-core');
const path = require('path');

const EXE = process.env.CHROMIUM || '/opt/pw-browsers/chromium';
const PAGE = 'file://' + path.resolve(__dirname, '..', 'index.html');
const WIDTHS = [1440, 1024, 700, 430, 390, 320, 300];
const STATES = [
  { name: 'all-on', off: [] },
  { name: 'no-walks', off: ['walks'] },
  { name: 'no-readout-fplane', off: ['readout', 'fplane'] },
  { name: 'no-archive-status', off: ['archive', 'status'] },
  { name: 'no-specimen', off: ['specimen'] },
  { name: 'minimal', off: ['mast', 'archive', 'status', 'walks'] },
];

function intersect(a, b) {
  const tol = 0.5;
  return a.x + tol < b.x + b.width && b.x + tol < a.x + a.width &&
         a.y + tol < b.y + b.height && b.y + tol < a.y + a.height;
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  let failures = 0, checks = 0;
  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: 860 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(PAGE);
    await page.waitForTimeout(2200);
    for (const st of STATES) {
      // set state from all-on baseline
      await page.evaluate(off => {
        for (const btn of document.querySelectorAll('.unitbar button[data-toggle]')) {
          const key = btn.dataset.toggle;
          const hidden = document.querySelector(`[data-unit="${key}"]`).classList.contains('is-hidden');
          const want = off.includes(key);
          if (hidden !== want) btn.click();
        }
      }, st.off);
      await page.waitForTimeout(700); // springs settle (~4.6/14s = 330ms)
      // Narrow screens scroll the stage under the pinned roster, so rest at
      // scroll-top is not the only resting layout: check mid-scroll too.
      for (const scrolled of [false, true]) {
        await page.evaluate(s => {
          const st = document.querySelector('.zui-stage');
          st.scrollTop = s ? Math.round(st.scrollHeight / 3) : 0;
        }, scrolled);
        await page.waitForTimeout(120);
      // Units AND the fixed chrome. The chrome is not in the dock flow, so
      // nothing structural keeps it off the panels: the unit roster wraps to
      // more rows on a narrow screen and will sit on the top dock unless its
      // measured height drives the rig's clearance. Check it here or that
      // regression ships invisible to a units-only sweep.
      const rects = await page.evaluate(() => {
        const box = (el, key) => { const r = el.getBoundingClientRect();
          return { key, x: r.x, y: r.y, width: r.width, height: r.height }; };
        const out = [...document.querySelectorAll('.zui-unit')]
          .filter(el => !el.classList.contains('is-hidden'))
          .map(el => box(el, el.dataset.unit));
        for (const sel of ['.unitbar', '.zrail']) {
          const el = document.querySelector(sel);
          if (el && el.offsetParent !== null) out.push(box(el, sel));
        }
        return out;
      });
      for (let i = 0; i < rects.length; i++)
        for (let j = i + 1; j < rects.length; j++) {
          checks++;
          if (intersect(rects[i], rects[j])) {
            failures++;
            console.log(`OVERLAP @${width}px ${st.name}${scrolled ? ' scrolled' : ''}: ` +
              `${rects[i].key} x ${rects[j].key}`,
              JSON.stringify(rects[i]), JSON.stringify(rects[j]));
          }
        }
      }
    }
    if (errors.length) { failures++; console.log(`JS ERRORS @${width}px:`, errors.join(' | ')); }
    await page.close();
  }
  console.log(`${checks} pair checks across ${WIDTHS.length} widths x ${STATES.length} states ` +
    `x 2 scroll positions — ${failures === 0 ? 'ZERO OVERLAPS' : failures + ' FAILURES'}`);
  await browser.close();
  process.exit(failures ? 1 : 0);
})();
