/**
 * Page checks run by `postdoc test`: one test case per built page and window width,
 * and one for navigation without reloads. The test command writes the page list and
 * the settings to a manifest and passes its path in the POSTDOC_PAGE_CHECKS
 * environment variable. The problems found go to the file named by
 * POSTDOC_PAGE_CHECKS_REPORT, if it's set, for the summary that the test command prints.
 *
 * The checks themselves are in the page-checks folder.
 */
import process from 'node:process';
import { readFileSync } from 'node:fs';

import { openPage } from './page-checks/pages.js';
import { createReportError, reportProblem, setReportCheck, setReportContext, writeReport } from './page-checks/report.js';
import { installToolkit } from './page-checks/toolkit.js';
import { checkAccessibility } from './page-checks/accessibility.js';
import { checkDarkMode } from './page-checks/dark-mode.js';
import { checkKeyboard } from './page-checks/keyboard.js';
import { checkToggles } from './page-checks/toggles.js';
import { checkText } from './page-checks/text.js';
import { checkNavigation } from './page-checks/navigation.js';

if (!process.env.POSTDOC_PAGE_CHECKS) {
  throw new Error('Page checks need a manifest of pages: run them with `postdoc test`.');
}

const manifest = JSON.parse(readFileSync(process.env.POSTDOC_PAGE_CHECKS, 'utf8'));

// An error would end the test case, and Nightwatch would skip the pages after it. So a
// check that breaks on a page is reported as a failure of that page instead.
async function runCheck(browser, name, check) {
  setReportCheck(name);

  try {
    return await check();
  } catch (error) {
    reportProblem(browser, createReportError(`The ${name} check couldn't finish on this page: ${error.message}`));

    return null;
  }
}

describe('Page checks', function () {
  // Pages are checked at each of these window widths, or at the browser's own size.
  const widths = manifest.widths.length ? manifest.widths : [null];

  // Controls on every page, such as a menu button, are checked once per width.
  const checkedToggles = new Set();

  let initialRect = null;
  let currentWidth = null;

  async function useWidth(browser, width) {
    if (width && width !== currentWidth) {
      await browser.window.setRect({ width, height: initialRect.height });
      currentWidth = width;
    }
  }

  after(function () {
    const reportPath = process.env.POSTDOC_PAGE_CHECKS_REPORT;

    if (reportPath) {
      // With several environments, such as --env chrome,firefox, Nightwatch runs each in
      // a process of its own, which writes a report of its own.
      const environment = process.env.__NIGHTWATCH_ENV;

      writeReport(environment ? reportPath.replace(/\.json$/, `.${environment}.json`) : reportPath, environment);
    }
  });

  before(async function (browser) {
    // The browser stops scripts after its own timeout, so leave room for the wait.
    await browser.timeoutsAsyncScript(manifest.readyTimeout + 5000);

    if (manifest.widths.length) {
      initialRect = await browser.window.getRect();
    }
  });

  for (const pageUrl of manifest.pages) {
    for (const width of widths) {
      it(width ? `${pageUrl} at ${width}px` : pageUrl, async function (browser) {
        setReportContext({ page: pageUrl, width, check: 'page' });
        await useWidth(browser, width);

        if (!await openPage(browser, manifest, pageUrl)) {
          return;
        }

        await installToolkit(browser);

        // The checks that change the page least go first: the keyboard check moves the
        // focus, the toggles check opens things, and the text check changes the layout.
        const axeResults = manifest.a11y && await runCheck(browser, 'accessibility', () => checkAccessibility(browser, manifest.a11y));

        if (axeResults && manifest.a11y.darkMode) {
          await runCheck(browser, 'dark mode', () => checkDarkMode(browser, manifest.a11y, axeResults));
        }

        const keyboardResult = manifest.keyboard &&
          await runCheck(browser, 'keyboard', () => checkKeyboard(browser, manifest.keyboard, axeResults?.unnamedSelectors));

        if (manifest.toggles) {
          await runCheck(browser, 'toggles', () => checkToggles(browser, { manifest, pageUrl, width, checkedToggles, axeResults, keyboardResult }));
        }

        if (manifest.text) {
          await runCheck(browser, 'text', () => checkText(browser, manifest.text));
        }
      });
    }
  }

  if (manifest.navigation) {
    it('Navigation without reloads', async function (browser) {
      setReportContext({ width: widths[0], check: 'navigation' });
      await useWidth(browser, widths[0]);
      await runCheck(browser, 'navigation', () => checkNavigation(browser, manifest));
    });
  }
});
