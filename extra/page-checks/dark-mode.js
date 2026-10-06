/**
 * The dark mode part of the accessibility check. aXe checks contrast in the colours
 * the page has when it's checked, so this switches the page to its dark colours and
 * runs the contrast rules again.
 */

import { runAxe, reportViolations } from './accessibility.js';
import { installToolkit } from './toolkit.js';

const CONTRAST_RULES = ['color-contrast', 'color-contrast-enhanced', 'link-in-text-block'];

// Runs in the browser. Switches the page to dark colours the way its theme does, and
// keeps what's needed to switch it back.
function switchToDark(darkMode) {
  const { freezeMotion } = window.__postdocChecks;
  const root = document.documentElement;
  const getColors = () => [root, document.body].map((element) => {
    const style = getComputedStyle(element);

    return `${style.backgroundColor} ${style.color}`;
  }).join(' ');

  // A colour transition would be measured halfway.
  freezeMotion();

  window.__postdocColorScheme = {
    colors: getColors(),
    previousValue: darkMode.attribute === 'class' ? root.classList.contains(darkMode.value) : root.getAttribute(darkMode.attribute)
  };

  if (darkMode.attribute === 'class') {
    root.classList.add(darkMode.value);
  } else if (darkMode.attribute) {
    root.setAttribute(darkMode.attribute, darkMode.value);
  }
}

// Runs in the browser. Whether the page looks any different in dark mode.
function hasChangedColors() {
  const root = document.documentElement;
  const colors = [root, document.body].map((element) => {
    const style = getComputedStyle(element);

    return `${style.backgroundColor} ${style.color}`;
  }).join(' ');

  return colors !== window.__postdocColorScheme.colors;
}

// Runs in the browser.
function switchBack(darkMode) {
  const { releaseMotion } = window.__postdocChecks;
  const root = document.documentElement;
  const { previousValue } = window.__postdocColorScheme;

  if (darkMode.attribute === 'class') {
    root.classList.toggle(darkMode.value, previousValue);
  } else if (darkMode.attribute && previousValue === null) {
    root.removeAttribute(darkMode.attribute);
  } else if (darkMode.attribute) {
    root.setAttribute(darkMode.attribute, previousValue);
  }

  delete window.__postdocColorScheme;
  releaseMotion();
}

// Chrome and Edge can also make the page's prefers-color-scheme media queries match.
function emulateColorScheme(browser, value) {
  if (!browser.isChrome() && !browser.isEdge()) {
    return false;
  }

  return browser.driver.sendDevToolsCommand('Emulation.setEmulatedMedia', {
    features: value ? [{ name: 'prefers-color-scheme', value }] : []
  }).then(() => true);
}

/**
 * Reports contrast problems that the page has only in dark mode. `lightResults` is
 * what the accessibility check returned for the page in its own colours.
 */
export async function checkDarkMode(browser, a11y, lightResults) {
  const rules = CONTRAST_RULES.filter((rule) => lightResults.ranRules.has(rule));

  if (!rules.length) {
    return;
  }

  await installToolkit(browser);
  await browser.execute(switchToDark, [a11y.darkMode]);

  const isEmulated = await emulateColorScheme(browser, 'dark');

  try {
    if (!await browser.execute(hasChangedColors)) {
      browser.assert.ok(true, 'The page has the same colours in dark mode, so its contrast wasn\'t checked again');

      return;
    }

    const results = await runAxe(browser, a11y.context, { runOnly: { type: 'rule', values: rules } });

    if (!results) {
      return;
    }

    const reportedCount = reportViolations(browser, results.violations, { prefix: 'In dark mode: ', knownKeys: lightResults.violationKeys });

    if (!reportedCount) {
      browser.assert.ok(true, 'No contrast problems in dark mode');
    }
  } finally {
    await browser.execute(switchBack, [a11y.darkMode]);

    if (isEmulated) {
      await emulateColorScheme(browser, null);
    }
  }
}
