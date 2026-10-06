/**
 * The text check. People who need larger text, or more space between lines and
 * letters, set it in their browser, and no text should get cut off when they do:
 *
 * - text spacing (WCAG 1.4.12): line height 1.5, paragraphs 2em apart, letter spacing
 *   0.12em and word spacing 0.16em
 * - resize text (WCAG 1.4.4): text twice as large, as a browser's text-only zoom does
 *
 * This applies each to the page and reports the boxes that now cut off their text,
 * usually because they have a fixed height or width and hide what overflows.
 */

import { createListError, createReportError, reportProblem } from './report.js';
import { installToolkit } from './toolkit.js';

const TEXT_PROBLEMS = {
  spacing: {
    message: 'Text that gets cut off with more space between lines, words and letters',
    link: 'https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html'
  },
  resize: {
    message: 'Text that gets cut off when it is twice as large',
    link: 'https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html'
  }
};

// Runs in the browser. Returns the boxes that cut off text after the adjustment and
// didn't before it.
function findCutOffText(adjustment, ignore) {
  const { isIgnored, isOnPage, describe, freezeMotion, releaseMotion } = window.__postdocChecks;
  const HIDES_OVERFLOW = ['hidden', 'clip'];
  const SCROLLS = ['auto', 'scroll'];
  // Less than this is rounding, such as a box sized in em that grows with its text.
  const MIN_OVERFLOW = 4;
  const MAX_TEXT_NODES = 2000;

  const invalidSelectors = ignore.filter((selector) => {
    try {
      document.querySelector(selector);

      return false;
    } catch {
      return true;
    }
  });

  if (invalidSelectors.length) {
    return { invalidSelectors, cutOff: [] };
  }

  // How far the element's text reaches past its edges. Text in a part that scrolls
  // can still be reached, and other content, such as a map, isn't text.
  function measureCutOffText(element, clipsX, clipsY) {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const right = box.right - parseFloat(style.borderRightWidth);
    const bottom = box.bottom - parseFloat(style.borderBottomWidth);
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let overflowX = 0;
    let overflowY = 0;

    const isInScrollingPart = (node) => {
      for (let ancestor = node.parentElement; ancestor && ancestor !== element; ancestor = ancestor.parentElement) {
        const { overflowX: x, overflowY: y } = getComputedStyle(ancestor);

        if (SCROLLS.includes(x) || SCROLLS.includes(y)) {
          return true;
        }
      }

      return false;
    };

    for (let node = walker.nextNode(), count = 0; node && count < MAX_TEXT_NODES; node = walker.nextNode(), count++) {
      if (!node.textContent.trim() || !isOnPage(node.parentElement) || isInScrollingPart(node)) {
        continue;
      }

      range.selectNodeContents(node);

      for (const rect of range.getClientRects()) {
        overflowX = clipsX ? Math.max(overflowX, rect.right - right) : overflowX;
        overflowY = clipsY ? Math.max(overflowY, rect.bottom - bottom) : overflowY;
      }
    }

    return { overflowX, overflowY };
  }

  // Elements that cut off part of their text, with how much. Content that scrolls can
  // still be reached, so it doesn't count.
  function findClipping() {
    const clipping = new Map();

    for (const element of document.body.querySelectorAll('*')) {
      const style = getComputedStyle(element);
      const clipsX = HIDES_OVERFLOW.includes(style.overflowX);
      const clipsY = HIDES_OVERFLOW.includes(style.overflowY) || style.getPropertyValue('-webkit-line-clamp') !== 'none';

      // A collapsed element, such as a closed panel, hides its content on purpose.
      if ((!clipsX && !clipsY) || !element.clientWidth || !element.clientHeight) {
        continue;
      }

      // Only an element whose content overflows can cut off text.
      if (element.scrollWidth - element.clientWidth < MIN_OVERFLOW && element.scrollHeight - element.clientHeight < MIN_OVERFLOW) {
        continue;
      }

      const { overflowX, overflowY } = measureCutOffText(element, clipsX, clipsY);

      if (overflowX >= MIN_OVERFLOW || overflowY >= MIN_OVERFLOW) {
        clipping.set(element, { overflowX, overflowY });
      }
    }

    return clipping;
  }

  function addTextSpacing() {
    const style = document.createElement('style');

    style.textContent = '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } ' +
      'p { margin-bottom: 2em !important; }';
    document.head.append(style);

    return () => style.remove();
  }

  // Text-only zoom makes the text larger but leaves the size of boxes as it is.
  function doubleTextSize() {
    const elements = [document.documentElement, ...document.querySelectorAll('body, body *')];
    const sizes = elements.map((element) => parseFloat(getComputedStyle(element).fontSize));
    const inlineSizes = elements.map((element) => [element.style.getPropertyValue('font-size'), element.style.getPropertyPriority('font-size')]);

    elements.forEach((element, index) => element.style.setProperty('font-size', `${sizes[index] * 2}px`, 'important'));

    return () => elements.forEach((element, index) => {
      const [value, priority] = inlineSizes[index];

      if (value) {
        element.style.setProperty('font-size', value, priority);
      } else {
        element.style.removeProperty('font-size');
      }

      if (element.getAttribute('style') === '') {
        element.removeAttribute('style');
      }
    });
  }

  // A transition would keep the old sizes for a moment.
  freezeMotion();

  const before = findClipping();
  const undo = adjustment === 'spacing' ? addTextSpacing() : doubleTextSize();

  try {
    const after = findClipping();
    const cutOff = [...after.keys()].filter((element) => !before.has(element) && !isIgnored(element, ignore) && isOnPage(element));

    // The innermost box that cuts off the text is the one to fix.
    const innermost = cutOff.filter((element) => !cutOff.some((other) => other !== element && element.contains(other)));

    return {
      invalidSelectors: [],
      cutOff: innermost.map((element) => {
        const { overflowX, overflowY } = after.get(element);
        const amounts = [
          overflowY >= MIN_OVERFLOW && `${Math.round(overflowY)}px at the bottom`,
          overflowX >= MIN_OVERFLOW && `${Math.round(overflowX)}px at the side`
        ].filter(Boolean);

        return `${describe(element)}: cuts off ${amounts.join(' and ')}`;
      })
    };
  } finally {
    undo();
    releaseMotion();
  }
}

export async function checkText(browser, text) {
  await installToolkit(browser);

  let problemCount = 0;

  for (const adjustment of ['spacing', 'resize']) {
    if (!text[adjustment]) {
      continue;
    }

    const result = await browser.execute(findCutOffText, [adjustment, text.ignore ?? []]);

    if (result.invalidSelectors.length) {
      reportProblem(browser, createReportError(`The text check can't ignore these invalid CSS selectors: ${result.invalidSelectors.join(', ')}`));

      return;
    }

    if (result.cutOff.length) {
      problemCount++;
      reportProblem(browser, createListError(`Text: ${TEXT_PROBLEMS[adjustment].message}`, result.cutOff, TEXT_PROBLEMS[adjustment].link));
    }
  }

  if (!problemCount) {
    browser.assert.ok(true, 'No text gets cut off with more spacing or larger text');
  }
}
