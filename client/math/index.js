/**
 * Styles the math of a page. The Markdown compiler writes each formula with KaTeX, as
 * MathML for assistive technology and as HTML that KaTeX's stylesheet lays out, and
 * PostDoc loads this module on the pages that have math.
 */

import 'katex/dist/katex.min.css';
import './math.css';
import { onRender } from '../page/index.js';

let pageEvents;

// A formula that is wider than the page scrolls sideways. A box that scrolls has to be
// reachable with the keyboard, so it can be scrolled with the arrow keys too.
function updateScrollableFormulas(formulas) {
  for (const formula of formulas) {
    const scrolls = formula.scrollWidth > formula.clientWidth + 1;

    if (scrolls && !formula.hasAttribute('tabindex')) {
      formula.setAttribute('tabindex', '0');
      formula.dataset.pdScrollable = '';
    } else if (!scrolls && 'pdScrollable' in formula.dataset) {
      formula.removeAttribute('tabindex');
      delete formula.dataset.pdScrollable;
    }
  }
}

onRender(() => {
  pageEvents?.abort();

  const formulas = [...document.querySelectorAll('.katex-display')];

  if (!formulas.length) {
    return;
  }

  let resizeTimer;

  pageEvents = new AbortController();
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => updateScrollableFormulas(formulas), 150);
  }, { signal: pageEvents.signal });

  // KaTeX's fonts change the width of a formula once they have loaded.
  return (document.fonts?.ready ?? Promise.resolve()).then(() => updateScrollableFormulas(formulas));
}, {
  forPage: () => true
});
