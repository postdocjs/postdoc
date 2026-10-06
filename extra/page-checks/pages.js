import { createReportError, reportProblem } from './report.js';

// Runs in the browser. PostDoc's client sets data-postdoc-ready on <html> once the
// page's onRender callbacks have finished, so content rendered after the page loads,
// such as diagrams, is in place. Calls back with the time it took, or -1 on timeout.
function waitUntilReady(timeout, done) {
  const start = Date.now();

  (function check() {
    if (document.documentElement.hasAttribute('data-postdoc-ready')) {
      done(Date.now() - start);
    } else if (Date.now() - start >= timeout) {
      done(-1);
    } else {
      setTimeout(check, 50);
    }
  })();
}

export function waitForReady(browser, manifest) {
  return browser.executeAsync(waitUntilReady, [manifest.readyTimeout]);
}

// The address of a page, which is relative to the site: it may be served from a subfolder.
export const getPageAddress = (manifest, pageUrl) => new URL(pageUrl.slice(1), manifest.baseUrl).href;

/**
 * Opens a page and waits until PostDoc has rendered it. Fails the test case and
 * returns false when it doesn't finish in time.
 */
export async function openPage(browser, manifest, pageUrl) {
  await browser.navigateTo(getPageAddress(manifest, pageUrl));

  if (await waitForReady(browser, manifest) >= 0) {
    return true;
  }

  reportProblem(browser, createReportError(
    `The page didn't finish rendering within ${manifest.readyTimeout} ms, so it wasn't checked.\n` +
    '\tAn onRender callback may never finish, or the layout has no </head> for PostDoc\'s script.'
  ));

  return false;
}
