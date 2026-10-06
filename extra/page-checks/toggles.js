/**
 * The toggles check. Menus, dialogs and panels that a button opens are hidden when the
 * page loads, so the other checks don't see them. This opens each one with the
 * keyboard, checks it, and closes it again:
 *
 * - pressing Enter opens it, and aria-expanded says so
 * - the focus moves into a modal dialog, and Tab keeps it there
 * - Tab can reach what opened
 * - aXe and the keyboard check find no new problems while it's open
 * - Escape closes a dialog, a menu or an overlay and gives the focus back to the
 *   button; pressing Enter again closes anything else, such as an accordion panel
 *
 * A toggle is a button with aria-expanded="false", aria-haspopup, popovertarget or
 * commandfor, or the summary of a closed <details>.
 */

import { createReportError, createListError, reportProblem } from './report.js';
import { installToolkit } from './toolkit.js';
import { openPage } from './pages.js';
import { runAxe, reportViolations, getUnnamedSelectors } from './accessibility.js';
import { walkWithKeyboard, reportKeyboardProblems } from './keyboard.js';

// The WebDriver key codes for Enter and Escape.
const ENTER = '';
const ESCAPE = '';

// What opened is marked with this attribute while it's checked.
const REGION_SELECTOR = '[data-postdoc-region]';

const PATTERNS = {
  dialog: { name: 'the dialog', link: 'https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/' },
  popup: { name: 'the popup', link: 'https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/' },
  menu: { name: 'the menu', link: 'https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/' },
  overlay: { name: 'it', link: 'https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/' },
  disclosure: { name: 'it', link: 'https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/' }
};

// Runs in the browser. Finds the toggles that can be opened now and numbers them.
function findToggles(ignore) {
  const { FOCUSABLE, isIgnored, isOnPage, describe } = window.__postdocChecks;
  const POPUP_TYPES = ['true', 'menu', 'listbox', 'tree', 'grid', 'dialog'];

  const hash = (text) => {
    let value = 5381;

    for (let index = 0; index < text.length; index++) {
      value = ((value << 5) + value + text.charCodeAt(index)) | 0;
    }

    return value.toString(16);
  };

  const isClosedSummary = (element) => element.localName === 'summary' &&
    element.parentElement?.localName === 'details' &&
    !element.parentElement.open &&
    element.parentElement.querySelector(':scope > summary') === element;

  const isToggle = (element) => element.getAttribute('aria-expanded') === 'false' ||
    (!element.hasAttribute('aria-expanded') && (
      POPUP_TYPES.includes(element.getAttribute('aria-haspopup')) || element.hasAttribute('popovertarget') || element.hasAttribute('commandfor')
    )) ||
    isClosedSummary(element);

  const toggles = [...document.querySelectorAll('button, [role="button"], summary, input[type="button"]')].filter((element) =>
    isToggle(element) &&
    element.matches(FOCUSABLE) &&
    !element.matches(':disabled, [aria-disabled="true"]') &&
    isOnPage(element) &&
    !isIgnored(element, ignore)
  );

  document.querySelectorAll('[data-postdoc-toggle]').forEach((element) => element.removeAttribute('data-postdoc-toggle'));

  return toggles.map((element, index) => {
    const controlled = document.getElementById(element.getAttribute('aria-controls')?.split(/\s+/)[0] ?? '');
    const description = describe(element);

    element.setAttribute('data-postdoc-toggle', index);

    // The same toggle with the same content on another page is checked only once.
    return { index, description, signature: `${description}|${hash(controlled?.textContent ?? '')}` };
  });
}

// Runs in the browser. Remembers what is open before the toggle is pressed, and
// focuses it. Reports whether it took the focus.
function prepareToggle(index, done) {
  const { isOnPage, getOpenDialogs, getOpenPopovers, freezeMotion, nextFrame } = window.__postdocChecks;
  const toggle = document.querySelector(`[data-postdoc-toggle="${index}"]`);

  if (!toggle) {
    done(false);

    return;
  }

  const controlled = document.getElementById(toggle.getAttribute('aria-controls')?.split(/\s+/)[0] ?? '');

  freezeMotion();

  window.__postdocToggle = {
    url: location.href,
    dialogs: new Set(getOpenDialogs()),
    popovers: new Set(getOpenPopovers()),
    wasControlledShown: Boolean(controlled && isOnPage(controlled)),
    wasRegionShown: false
  };

  toggle.scrollIntoView({ block: 'center' });
  toggle.focus();

  // Scrolling changes some pages too: a storymap moves to another step, and folds the
  // credits of its map away. That comes a frame later, and has to be over before the
  // key is pressed, or it would undo what the key opens.
  nextFrame().then(nextFrame).then(() => done(document.activeElement === toggle));
}

// Runs in the browser. Waits until the page stops changing after Enter, finds what
// opened and marks it.
function inspectOpenedToggle(index, done) {
  const { FOCUSABLE, isOnPage, isTabbable, describe, matchesSafely, getOpenDialogs, getOpenPopovers, waitForQuiet } = window.__postdocChecks;
  const MENU_POPUP_TYPES = ['true', 'menu', 'listbox', 'tree', 'grid'];

  // An overlay is fixed in place and covers at least half of the window.
  function coversWindow(element) {
    for (let node = element; node && node !== document.body; node = node.parentElement) {
      if (getComputedStyle(node).position === 'fixed') {
        const rect = node.getBoundingClientRect();
        const width = Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0));
        const height = Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0));

        return width * height >= innerWidth * innerHeight / 2;
      }
    }

    return false;
  }

  waitForQuiet().then(() => {
    const state = window.__postdocToggle;
    const toggle = document.querySelector(`[data-postdoc-toggle="${index}"]`);

    if (!toggle || location.href !== state.url) {
      done({ hasLeftPage: true });

      return;
    }

    const byId = (attribute) => document.getElementById(toggle.getAttribute(attribute)?.split(/\s+/)[0] ?? '');
    const expanded = toggle.getAttribute('aria-expanded');
    const newDialog = getOpenDialogs().find((dialog) => !state.dialogs.has(dialog));
    const newPopover = getOpenPopovers().find((popover) => !state.popovers.has(popover));
    const details = toggle.localName === 'summary' ? toggle.parentElement : null;
    const controlled = byId('aria-controls') ?? byId('popovertarget') ?? byId('commandfor');

    let region = null;
    let kind = 'disclosure';

    if (newDialog) {
      region = newDialog;
      kind = 'dialog';
    } else if (newPopover) {
      region = newPopover;
      kind = 'popup';
    } else if (details?.open) {
      region = details;
    } else if (controlled && isOnPage(controlled)) {
      region = controlled;
      state.wasRegionShown = state.wasControlledShown;
    }

    const hasOpened = expanded === 'true' || Boolean(newDialog || newPopover || details?.open) || Boolean(region && !state.wasRegionShown);

    if (!hasOpened) {
      done({ hasOpened: false, hasExpanded: toggle.hasAttribute('aria-expanded') });

      return;
    }

    const popupType = toggle.getAttribute('aria-haspopup');
    const regionRole = region?.getAttribute('role');

    if (kind === 'disclosure' && (popupType === 'dialog' || regionRole === 'dialog' || regionRole === 'alertdialog')) {
      kind = 'dialog';
    } else if (kind === 'disclosure' && (MENU_POPUP_TYPES.includes(popupType) || ['menu', 'listbox'].includes(regionRole))) {
      kind = 'menu';
    } else if (kind === 'disclosure' && region && coversWindow(region)) {
      kind = 'overlay';
    }

    region?.setAttribute('data-postdoc-region', '');

    done({
      hasOpened: true,
      kind,
      isModal: Boolean(region && (matchesSafely(region, ':modal') || region.getAttribute('aria-modal') === 'true')),
      region: region ? describe(region, false) : null,
      regionTabStops: region ? [...region.querySelectorAll(FOCUSABLE)].filter(isTabbable).length : 0,
      isExpandedStale: toggle.hasAttribute('aria-expanded') && expanded !== 'true',
      isFocusInside: Boolean(region?.contains(document.activeElement))
    });
  });
}

// Runs in the browser. Escape is pressed where a keyboard user would be: in what
// opened. Enter, to close it again, is pressed on the toggle.
function prepareClosing(index, usesEscape) {
  const { FOCUSABLE, isTabbable } = window.__postdocChecks;
  const toggle = document.querySelector(`[data-postdoc-toggle="${index}"]`);
  const region = document.querySelector('[data-postdoc-region]');
  const firstInside = region && [...region.querySelectorAll(FOCUSABLE)].find(isTabbable);

  (usesEscape && firstInside ? firstInside : toggle)?.focus();
}

// Runs in the browser. Waits until the page stops changing after the key press, and
// finds out whether what opened is closed and where the focus is.
function inspectClosedToggle(index, done) {
  const { isOnPage, describe, getOpenPopovers, waitForQuiet, releaseMotion } = window.__postdocChecks;

  waitForQuiet().then(() => {
    const state = window.__postdocToggle;
    const toggle = document.querySelector(`[data-postdoc-toggle="${index}"]`);
    const region = document.querySelector('[data-postdoc-region]');
    const focus = document.activeElement;

    let isRegionOpen = false;

    if (region?.localName === 'dialog' || region?.localName === 'details') {
      isRegionOpen = region.open;
    } else if (region) {
      isRegionOpen = getOpenPopovers().includes(region) || (!state.wasRegionShown && isOnPage(region));
    }

    region?.removeAttribute('data-postdoc-region');
    releaseMotion();
    delete window.__postdocToggle;

    done({
      isRegionOpen,
      isExpanded: toggle?.getAttribute('aria-expanded') === 'true',
      isFocusOnToggle: Boolean(toggle) && focus === toggle,
      focus: focus && focus !== document.body ? describe(focus) : null
    });
  });
}

async function pressKey(browser, key) {
  await browser.actions({ async: true }).sendKeys(key).perform();
}

/**
 * Opens one toggle, checks it and closes it. Returns how many problems it reported,
 * and whether the page is back as it was.
 */
async function checkToggle(browser, toggle, { manifest, axeResults, keyboardResult }) {
  let problemCount = 0;

  const fail = (message, link) => {
    problemCount++;
    reportProblem(browser, createReportError(`Toggle ${toggle.description}: ${message}`, link));
  };

  if (!await browser.executeAsync(prepareToggle, [toggle.index])) {
    await browser.execute(function () {
      window.__postdocChecks.releaseMotion();
    });

    return { problemCount, isRestored: true };
  }

  await pressKey(browser, ENTER);

  const opened = await browser.executeAsync(inspectOpenedToggle, [toggle.index]);

  // Not a toggle after all: it opened another page.
  if (opened.hasLeftPage) {
    return { problemCount, isRestored: false };
  }

  if (!opened.hasOpened) {
    fail(
      opened.hasExpanded ? 'pressing Enter doesn\'t open it, and aria-expanded stays "false".' : 'pressing Enter doesn\'t open anything.',
      'https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html'
    );

    await browser.execute(function () {
      window.__postdocChecks.releaseMotion();
    });

    return { problemCount, isRestored: true };
  }

  const pattern = PATTERNS[opened.kind];
  const usesEscape = opened.kind !== 'disclosure' || opened.isModal;
  const openPrefix = `With ${toggle.description} open: `;

  if (opened.isExpandedStale) {
    fail(`${pattern.name} opens, but aria-expanded stays "false".`, 'https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html');
  }

  if (opened.isModal && !opened.isFocusInside) {
    fail(`the focus stays outside ${pattern.name} when it opens.`, pattern.link);
  }

  let unnamedByAxe = axeResults?.unnamedSelectors ?? [];

  if (axeResults) {
    const results = await runAxe(browser, opened.region ? REGION_SELECTOR : manifest.a11y.context, manifest.a11y.options);

    if (results) {
      problemCount += reportViolations(browser, results.violations, { prefix: openPrefix, knownKeys: axeResults.violationKeys });
      unnamedByAxe = unnamedByAxe.concat(getUnnamedSelectors(results));
    }
  }

  if (keyboardResult) {
    const walk = await walkWithKeyboard(browser, {
      ...manifest.keyboard,
      regionSelector: opened.region ? REGION_SELECTOR : null,
      unnamedByAxe
    });

    problemCount += reportKeyboardProblems(browser, walk, { prefix: openPrefix, known: keyboardResult });

    if (walk.region && opened.regionTabStops && !walk.region.insideCount) {
      fail(`Tab can't reach ${pattern.name} (${opened.region}).`, 'https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html');
    }

    if (walk.region && opened.isModal && walk.region.outside.length) {
      problemCount++;
      reportProblem(browser, createListError(
        `Toggle ${toggle.description}: Tab moves the focus out of ${pattern.name} while it's open, to the page behind it`,
        walk.region.outside,
        pattern.link
      ));
    }
  }

  await browser.execute(prepareClosing, [toggle.index, usesEscape]);
  await pressKey(browser, usesEscape ? ESCAPE : ENTER);

  const closed = await browser.executeAsync(inspectClosedToggle, [toggle.index]);

  if (closed.isRegionOpen) {
    fail(usesEscape ? `Escape doesn't close ${pattern.name}.` : `pressing Enter on it again doesn't close ${pattern.name}.`, pattern.link);
  } else if (closed.isExpanded) {
    fail(`${pattern.name} closes, but aria-expanded stays "true".`, 'https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html');
  } else if (usesEscape && !closed.isFocusOnToggle) {
    fail(
      `after Escape closes ${pattern.name}, the focus ${closed.focus ? `goes to ${closed.focus}` : 'is lost'} instead of going back to the button.`,
      'https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html'
    );
  }

  return { problemCount, isRestored: !closed.isRegionOpen && !closed.isExpanded };
}

/**
 * Opens and checks each toggle on the page. Toggles already checked on another page at
 * the same width, which `checkedToggles` keeps track of, are skipped.
 */
export async function checkToggles(browser, { manifest, pageUrl, width, checkedToggles, axeResults, keyboardResult }) {
  // Safari doesn't move the focus with the keyboard the way the other browsers do.
  if (browser.isSafari()) {
    return;
  }

  await installToolkit(browser);

  let toggles = await browser.execute(findToggles, [manifest.toggles.ignore ?? []]);
  let checkedCount = 0;
  let problemCount = 0;

  for (let position = 0; position < toggles.length && checkedCount < manifest.toggles.maxToggles; position++) {
    const toggle = toggles[position];
    const key = `${width}|${toggle.signature}`;

    if (checkedToggles.has(key)) {
      continue;
    }

    checkedToggles.add(key);
    checkedCount++;

    const result = await checkToggle(browser, toggle, { manifest, axeResults, keyboardResult });

    problemCount += result.problemCount;

    // Something stayed open or the page changed, so the next toggle starts from a
    // freshly loaded page.
    if (!result.isRestored) {
      if (!await openPage(browser, manifest, pageUrl)) {
        return;
      }

      await installToolkit(browser);
      toggles = await browser.execute(findToggles, [manifest.toggles.ignore ?? []]);
    }
  }

  if (checkedCount && !problemCount) {
    browser.assert.ok(true, `${checkedCount} toggle(s) open and close with the keyboard without problems`);
  }
}
