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
const WIDTHS = [1440, 1024, 700, 430];
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
      const rects = await page.evaluate(() =>
        [...document.querySelectorAll('.zui-unit')]
          .filter(el => !el.classList.contains('is-hidden'))
          .map(el => { const r = el.getBoundingClientRect();
            return { key: el.dataset.unit, x: r.x, y: r.y, width: r.width, height: r.height }; })
      );
      for (let i = 0; i < rects.length; i++)
        for (let j = i + 1; j < rects.length; j++) {
          checks++;
          if (intersect(rects[i], rects[j])) {
            failures++;
            console.log(`OVERLAP @${width}px ${st.name}: ${rects[i].key} x ${rects[j].key}`,
              JSON.stringify(rects[i]), JSON.stringify(rects[j]));
          }
        }
    }
    if (errors.length) { failures++; console.log(`JS ERRORS @${width}px:`, errors.join(' | ')); }
    await page.close();
  }
  console.log(`${checks} pair checks across ${WIDTHS.length} widths x ${STATES.length} states — ${failures === 0 ? 'ZERO OVERLAPS' : failures + ' FAILURES'}`);
  await browser.close();
  process.exit(failures ? 1 : 0);
})();
