/**
 * The keyboard check. It presses Tab through a page, the way a keyboard user would,
 * and looks at every element that takes the focus. It also looks for elements that act
 * as controls but can't take the focus at all.
 *
 * The browser records each focus stop as it happens, so the Tab presses go to the
 * browser in batches instead of one WebDriver call each.
 */

import { createReportError, createListError, reportProblem } from './report.js';
import { installToolkit } from './toolkit.js';

// The WebDriver key code for Tab.
const TAB = '\uE004';
const TABS_PER_BATCH = 50;

const KEYBOARD_PROBLEMS = {
  hidden: {
    message: 'Tab stops that can\'t be seen when they have the keyboard focus',
    link: 'https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html'
  },
  noIndicator: {
    message: 'Tab stops that look the same with and without the keyboard focus',
    link: 'https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html'
  },
  unnamed: {
    message: 'Tab stops without an accessible name',
    link: 'https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html'
  },
  unreachable: {
    message: 'Elements that look or act like controls but can\'t take the keyboard focus',
    link: 'https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html'
  },
  deadLinks: {
    message: 'Links that go nowhere. Use a button for an action, or link to an address',
    link: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Element/a#onclick_events'
  }
};

/**
 * Presses Tab through the current page and returns what the walk found. Afterwards,
 * nothing on the page has the focus and it is scrolled to the top.
 *
 * With `regionSelector`, the result also says which Tab stops are inside that part of
 * the page and which are outside it.
 */
export async function walkWithKeyboard(browser, settings) {
  await installToolkit(browser);

  const start = await browser.execute(startKeyboardWalk, [settings]);

  if (start.invalidSelectors.length) {
    return start;
  }

  let status = { stopCount: 0, isDone: false };

  while (!status.isDone) {
    const previousCount = status.stopCount;

    await browser.actions({ async: true }).sendKeys(TAB.repeat(TABS_PER_BATCH)).perform();

    status = await browser.execute(function () {
      return window.__postdocKeyboardWalk.getStatus();
    });

    // Nothing more takes the focus: the page has no Tab stops, the focus left the
    // page for good or something keeps it in place.
    if (status.stopCount === previousCount) {
      break;
    }
  }

  await browser.executeAsync(function (done) {
    window.__postdocKeyboardWalk.recheckHidden(done);
  });

  return browser.execute(function () {
    return window.__postdocKeyboardWalk.finish();
  });
}

// Runs in the browser. Everything it uses is defined inside or in the toolkit.
function startKeyboardWalk(settings) {
  const {
    FOCUSABLE, isIgnored, getRects, isOnPage, getShownBox, getName, describe,
    matchesSafely, getOpenDialogs, freezeMotion, releaseMotion, nextFrame, wait
  } = window.__postdocChecks;
  const ignore = settings.ignore ?? [];
  const maxStops = settings.maxStops ?? 1000;
  // Elements aXe already reported as having no name.
  const unnamedByAxe = new Set((settings.unnamedByAxe ?? []).flatMap((selector) => {
    try {
      return [...document.querySelectorAll(selector)];
    } catch {
      return [];
    }
  }));

  const invalidSelectors = ignore.filter((selector) => {
    try {
      document.querySelector(selector);

      return false;
    } catch {
      return true;
    }
  });

  if (invalidSelectors.length) {
    return { invalidSelectors };
  }

  // The properties a focus indicator usually changes.
  const APPEARANCE = [
    'outline-style', 'outline-width', 'outline-color', 'outline-offset', 'box-shadow',
    'background-color', 'background-image', 'color', 'opacity', 'filter', 'transform', 'visibility',
    'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
    'border-top-width', 'border-bottom-width',
    'text-decoration-line', 'text-decoration-color', 'text-decoration-thickness',
    'fill', 'stroke', 'stroke-width'
  ];
  const CONTROL_ROLES = [
    'button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
    'slider', 'spinbutton', 'combobox', 'textbox', 'searchbox'
  ];
  const PSEUDO_ELEMENTS = [null, '::before', '::after'];
  const MAX_RECHECKS = 50;
  const RECHECK_DELAY = 50;

  // An indicator drawn with a transition would be measured halfway.
  freezeMotion();

  const isWalkIgnored = (element) => isIgnored(element, ignore);

  // How an element looks. Changes to an element that isn't drawn, such as the focus
  // ring of a hidden checkbox, can't be seen, so only whether it is drawn counts: a
  // skip link, for example, is moved onto the page when it has the focus.
  function getAppearance(element) {
    if (!isOnPage(element)) {
      return 'not drawn';
    }

    return PSEUDO_ELEMENTS.map((pseudoElement) => {
      const computed = getComputedStyle(element, pseudoElement);

      return APPEARANCE.map((property) => computed.getPropertyValue(property)).join('|');
    }).join('#');
  }

  // A focus indicator may be drawn on an element nearby: the label of a hidden
  // checkbox, the styled switch next to it, or the list item around a link.
  function getRelatives(element) {
    const parent = element.parentElement;

    return [element, ...(element.labels ?? []), parent, parent?.parentElement, element.previousElementSibling, element.nextElementSibling]
      .filter((relative, index, all) => relative && relative !== document.body && relative !== document.documentElement && all.indexOf(relative) === index);
  }

  const takeSnapshot = (element) => new Map(getRelatives(element).map((relative) => [relative, getAppearance(relative)]));

  // Compares how the stop looked with the focus to how it looks now that it doesn't
  // have it. Elements nearby that the newly focused element changed don't count.
  function hasFocusIndicator(stop, focusedNow) {
    for (const [relative, appearance] of stop.appearance) {
      const isAroundOnlyTheNewFocus = focusedNow instanceof Element && !relative.contains(stop.element) && relative.contains(focusedNow);

      if (!isAroundOnlyTheNewFocus && getAppearance(relative) !== appearance) {
        return true;
      }
    }

    return false;
  }

  // Why the focused element can't be seen, or null when it can. It checks a few points
  // of each box, so an element partly under a sticky header still counts as seen.
  function findWhyHidden(element) {
    const box = getShownBox(element);

    if (!box) {
      return 'hidden';
    }

    // elementFromPoint skips elements that ignore the pointer, so there's no telling
    // whether anything covers them.
    if (getComputedStyle(box).pointerEvents === 'none') {
      return null;
    }

    let firstPoint = null;

    for (const rect of getRects(box)) {
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      // The middle of each edge, as well as the corners, so a round button counts too.
      const points = [
        [centerX, centerY],
        [centerX, rect.top + 2],
        [centerX, rect.bottom - 2],
        [rect.left + 2, centerY],
        [rect.right - 2, centerY],
        [rect.left + 2, rect.top + 2],
        [rect.right - 2, rect.top + 2],
        [rect.left + 2, rect.bottom - 2],
        [rect.right - 2, rect.bottom - 2]
      ];

      for (const [x, y] of points) {
        if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) {
          continue;
        }

        const topElement = document.elementFromPoint(x, y);

        if (topElement && (box.contains(topElement) || element.contains(topElement))) {
          return null;
        }

        firstPoint ??= { x, y, topElement };
      }
    }

    if (!firstPoint) {
      return 'outside the window';
    }

    const { x, y, topElement } = firstPoint;

    if (topElement && !topElement.contains(element)) {
      return `covered by ${describe(topElement, false)}`;
    }

    // Only the element's ancestors are drawn there, so one of them, such as a
    // collapsed panel, cuts it off.
    const clipping = findClippingAncestor(element, x, y);

    return clipping ? `cut off by ${describe(clipping, false)}` : 'hidden';
  }

  // The closest ancestor that clips its content and doesn't reach the point.
  function findClippingAncestor(element, x, y) {
    for (let ancestor = element.parentElement; ancestor && ancestor !== document.documentElement; ancestor = ancestor.parentElement) {
      const { overflowX, overflowY, clipPath } = getComputedStyle(ancestor);
      const bounds = ancestor.getBoundingClientRect();
      const isClipping = overflowX !== 'visible' || overflowY !== 'visible' || clipPath !== 'none';

      if (isClipping && (x < bounds.left || x >= bounds.right || y < bounds.top || y >= bounds.bottom)) {
        return ancestor;
      }
    }

    return null;
  }

  // Elements that look or act like controls but can't take the focus, so keyboard
  // users can't use them. Event listeners aren't visible to the page, so this goes by
  // roles, onclick attributes and the pointer cursor.
  function findUnreachableControls() {
    const found = [];

    for (const element of document.body.querySelectorAll('*')) {
      if (
        element.matches(FOCUSABLE) ||
        element.parentElement?.closest(FOCUSABLE) ||
        element.closest('[aria-activedescendant], [inert], label') ||
        element.matches(':disabled, [aria-disabled="true"]') ||
        isWalkIgnored(element)
      ) {
        continue;
      }

      const role = element.getAttribute('role');
      let reason = null;

      if (CONTROL_ROLES.includes(role)) {
        reason = `role="${role}"`;
      } else if (element.hasAttribute('onclick')) {
        reason = 'an onclick attribute';
      } else if (
        getComputedStyle(element).cursor === 'pointer' &&
        // Only the outermost element: the cursor is inherited.
        getComputedStyle(element.parentElement).cursor !== 'pointer' &&
        // A card with a link inside can be used through the link.
        !element.querySelector(FOCUSABLE)
      ) {
        reason = 'a pointer cursor';
      }

      if (reason && isOnPage(element)) {
        found.push(`${describe(element)}: ${reason}`);
      }
    }

    return found;
  }

  // Content that fades in when it's scrolled into view has a size, but it or an
  // ancestor is transparent or invisible. Returns that element, if any.
  function findTransparentAncestor(element) {
    if (!getRects(element).length) {
      return null;
    }

    for (let node = element; node && node !== document.documentElement; node = node.parentElement) {
      const { opacity, visibility } = getComputedStyle(node);

      if (opacity === '0' || visibility === 'hidden') {
        return node;
      }
    }

    return null;
  }

  // Where the Tab stops are relative to a region of the page, such as an open dialog.
  function getRegionStops() {
    const region = settings.regionSelector && document.querySelector(settings.regionSelector);

    if (!region) {
      return null;
    }

    return {
      insideCount: stops.filter((stop) => region.contains(stop.element)).length,
      outside: stops.filter((stop) => !region.contains(stop.element)).map((stop) => stop.description)
    };
  }

  function checkSkipLink(firstStop) {
    if (!firstStop) {
      return null;
    }

    const href = firstStop.element.getAttribute('href') ?? '';

    if (firstStop.element.localName !== 'a' || !href.startsWith('#') || href.length < 2) {
      return `The first Tab stop, ${firstStop.description}, isn't a skip link.`;
    }

    if (!document.getElementById(decodeURIComponent(href.slice(1)))) {
      return `The skip link ${firstStop.description} goes to ${href}, which isn't on the page.`;
    }

    return null;
  }

  const stops = [];
  const stopIndexes = new Map();
  let endReason = null;
  let trapStart = -1;
  let hasPassedEnd = false;

  // Tab past the last element takes the focus out of the page, to the browser's own
  // controls, and in Firefox key presses then stay there. So the walk keeps the focus
  // in: when it reaches a hidden element at the end, it moves to one at the start, and
  // the next Tab continues from the top, as it does in a browser. In an open modal
  // dialog, the rest of the page can't take the focus, so they go in the dialog.
  const sentinelContainer = getOpenDialogs().find((dialog) => matchesSafely(dialog, ':modal')) ?? document.body;
  const createSentinel = (tabIndex) => {
    const sentinel = document.createElement('div');

    sentinel.tabIndex = tabIndex;
    sentinel.setAttribute('data-postdoc-sentinel', '');
    sentinel.style.cssText = 'position: fixed; top: 0; left: 0; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%);';

    return sentinel;
  };
  const startSentinel = createSentinel(-1);
  const endSentinel = createSentinel(0);

  endSentinel.addEventListener('focus', () => {
    hasPassedEnd = true;
    startSentinel.focus({ preventScroll: true });

    // Coming back into the page, the focus starts at the top of it.
    if (sentinelContainer === document.body) {
      scrollTo(0, 0);
    } else {
      sentinelContainer.scrollTop = 0;
    }
  });
  sentinelContainer.prepend(startSentinel);
  sentinelContainer.append(endSentinel);

  function onFocusIn(event) {
    const element = event.target;

    if (endReason || !(element instanceof Element) || element.hasAttribute('data-postdoc-sentinel')) {
      return;
    }

    const previous = stops.at(-1);

    // The focus can come back to the same element, for example when the page moves it
    // there itself. Its indicator is measured when the walk stops.
    if (previous?.element === element) {
      if (hasPassedEnd) {
        endReason = 'end';
      }

      return;
    }

    if (previous && previous.hasIndicator === null) {
      previous.hasIndicator = hasFocusIndicator(previous, element);
    }

    if (stopIndexes.has(element)) {
      // Back where it started: past the end of the page, or round in a circle.
      if (hasPassedEnd) {
        endReason = 'end';
      } else {
        endReason = 'trap';
        trapStart = stopIndexes.get(element);
      }

      return;
    }

    if (stops.length >= maxStops) {
      endReason = 'limit';

      return;
    }

    stopIndexes.set(element, stops.length);
    stops.push({
      element,
      description: describe(element),
      appearance: takeSnapshot(element),
      whyHidden: findWhyHidden(element),
      transparentAncestor: findTransparentAncestor(element),
      hasName: Boolean(getName(element)),
      hasIndicator: null
    });
  }

  // Listening on window runs after the page's own focus listeners, which may draw
  // the indicator.
  window.addEventListener('focusin', onFocusIn);

  let isRecording = true;

  function stopRecording() {
    if (!isRecording) {
      return;
    }

    isRecording = false;
    window.removeEventListener('focusin', onFocusIn);
    startSentinel.remove();
    endSentinel.remove();

    const last = stops.at(-1);

    if (!endReason) {
      // Tab stopped moving the focus. Unless it passed the end of the page, the last
      // element keeps it, for example by handling Tab itself.
      endReason = hasPassedEnd || !last ? 'end' : 'trap';
      trapStart = stops.length - 1;
    }

    if (last && last.hasIndicator === null) {
      if (document.activeElement === last.element) {
        last.element.blur();
      }

      last.hasIndicator = hasFocusIndicator(last, document.activeElement);
    }
  }

  window.__postdocKeyboardWalk = {
    getStatus() {
      return { stopCount: stops.length, isDone: Boolean(endReason) };
    },

    // Content that fades in when it is scrolled into view is still transparent when
    // the focus arrives. This focuses one stop of each kind of transparent element
    // again, such as all the copy buttons, gives it a moment to appear, and looks again.
    // When it appears, the others of its kind get a moment too. A closed panel, which
    // hides its links the same way, stays hidden.
    recheckHidden(done) {
      stopRecording();

      const groups = new Map();

      for (const stop of stops.filter((stop) => stop.whyHidden && stop.transparentAncestor)) {
        const { localName, classList } = stop.transparentAncestor;
        const kind = [localName, ...classList].join('.');

        groups.set(kind, [...(groups.get(kind) ?? []), stop]);
      }

      // Measures a stop again while it has the focus.
      const remeasure = (stop) => {
        if (document.activeElement !== stop.element) {
          return;
        }

        stop.whyHidden = findWhyHidden(stop.element);

        if (stop.whyHidden) {
          return;
        }

        // Its indicator was measured while it couldn't be seen, so measure it again.
        // Firefox doesn't treat focus from a script as keyboard focus here, and then
        // there's no telling, so it isn't reported.
        if (stop.element.matches(':focus-visible')) {
          stop.appearance = takeSnapshot(stop.element);
          stop.element.blur();
          stop.hasIndicator = hasFocusIndicator(stop, null);
        } else {
          stop.hasIndicator = null;
        }
      };

      (async () => {
        for (const [first, ...others] of [...groups.values()].slice(0, MAX_RECHECKS)) {
          first.element.focus();

          await nextFrame();
          await nextFrame();
          await wait(RECHECK_DELAY);

          remeasure(first);

          if (first.whyHidden) {
            continue;
          }

          // An IntersectionObserver reports a frame after the element scrolls into view.
          for (const stop of others) {
            stop.element.focus();
            await nextFrame();
            await nextFrame();
            remeasure(stop);
          }
        }
      })().finally(() => done());
    },

    finish() {
      stopRecording();

      const isReported = (stop) => !isWalkIgnored(stop.element);
      const reported = stops.filter(isReported);
      const result = {
        invalidSelectors: [],
        stopCount: stops.length,
        isComplete: endReason !== 'limit',
        trap: endReason === 'trap' ? { size: stops.length - trapStart, start: stops[trapStart].description } : null,
        skipLink: checkSkipLink(stops[0]),
        hidden: reported.filter((stop) => stop.whyHidden).map((stop) => `${stop.description}: ${stop.whyHidden}`),
        // An element that can't be seen can't show the focus either, so it is reported once.
        noIndicator: reported.filter((stop) => !stop.whyHidden && stop.hasIndicator === false).map((stop) => stop.description),
        unnamed: reported.filter((stop) => !stop.hasName && !unnamedByAxe.has(stop.element)).map((stop) => stop.description),
        deadLinks: reported
          .filter((stop) => stop.element.matches('a[href="#"], a[href^="javascript:"]'))
          .map((stop) => `${stop.description}: href="${stop.element.getAttribute('href')}"`),
        unreachable: findUnreachableControls(),
        region: getRegionStops()
      };

      releaseMotion();
      document.activeElement?.blur();
      scrollTo(0, 0);
      delete window.__postdocKeyboardWalk;

      return result;
    }
  };

  return { invalidSelectors: [] };
}

/**
 * Reports the problems a walk found. Problems that are also in `known`, the result of
 * an earlier walk, were reported already and are left out. Returns how many it reported.
 */
export function reportKeyboardProblems(browser, result, { prefix = '', known = null } = {}) {
  let reportedCount = 0;

  for (const [key, problem] of Object.entries(KEYBOARD_PROBLEMS)) {
    const knownElements = new Set(known?.[key] ?? []);
    const elements = result[key].filter((element) => !knownElements.has(element));

    if (elements.length) {
      reportedCount++;
      reportProblem(browser, createListError(`${prefix}Keyboard: ${problem.message}`, elements, problem.link));
    }
  }

  return reportedCount;
}

/**
 * Checks the current page with the keyboard. Returns the walk's result, which other
 * checks compare theirs to, or null when the check didn't run.
 */
export async function checkKeyboard(browser, keyboard, unnamedSelectors = []) {
  // Safari moves the focus only between form fields unless its "Press Tab to
  // highlight each item" setting is on, which WebDriver can't change.
  if (browser.isSafari()) {
    browser.assert.ok(true, 'The keyboard check doesn\'t run in Safari, where Tab skips links by default');

    return null;
  }

  const result = await walkWithKeyboard(browser, { ...keyboard, unnamedByAxe: unnamedSelectors });

  if (result.invalidSelectors.length) {
    reportProblem(browser, createReportError(`The keyboard check can't ignore these invalid CSS selectors: ${result.invalidSelectors.join(', ')}`));

    return null;
  }

  let problemCount = 0;

  if (result.trap) {
    problemCount++;
    reportProblem(browser, createReportError(
      `Keyboard: the focus is trapped. Tab keeps going round ${result.trap.size} element(s), starting at ${result.trap.start}, and never reaches the rest of the page.`,
      'https://www.w3.org/WAI/WCAG22/Understanding/no-keyboard-trap.html'
    ));
  }

  if (keyboard.skipLink && result.skipLink) {
    problemCount++;
    reportProblem(browser, createReportError(
      `Keyboard: ${result.skipLink} Make the first link on the page go to the main content, such as <a href="#main">Skip to content</a>.`,
      'https://www.w3.org/WAI/WCAG22/Techniques/general/G1'
    ));
  }

  problemCount += reportKeyboardProblems(browser, result);

  if (!problemCount) {
    const scope = result.isComplete ? `all ${result.stopCount}` : `the first ${result.stopCount}`;

    browser.assert.ok(true, `No keyboard problems in ${scope} Tab stops`);
  }

  return result;
}
