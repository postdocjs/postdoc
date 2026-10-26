/**
 * The navigation check. When PostDoc shows the next page without a reload, the browser
 * doesn't tell assistive technology that the page changed, as it does after a page load.
 * This follows a link with the keyboard and checks that the new page is announced, has
 * its own title, and that Tab starts from the top of it, as after a page load.
 */

import { createReportError, reportProblem } from './report.js';
import { installToolkit } from './toolkit.js';
import { openPage } from './pages.js';

// The WebDriver key codes for Tab and Enter.
const TAB = '';
const ENTER = '';

const MAX_SOURCE_PAGES = 5;
const ANNOUNCEMENT_TIMEOUT = 2000;
const POLL_INTERVAL = 100;

// Runs in the browser. Finds a link to another page of the site that PostDoc opens in
// place, marks it, and marks the page, so a reload shows by the mark being gone.
function findPageLink(pages, baseUrl) {
  const { isTabbable, describe } = window.__postdocChecks;
  const basePath = new URL(baseUrl).pathname;

  // The page a URL opens, as the build's page list has it.
  const toPage = (url) => {
    if (!url.pathname.startsWith(basePath)) {
      return null;
    }

    let page = '/' + decodeURIComponent(url.pathname.slice(basePath.length));

    if (page.endsWith('/')) {
      page += 'index.html';
    } else if (!/\.[^/]+$/.test(page)) {
      page += '.html';
    }

    return page;
  };

  const currentPage = toPage(new URL(location.href));
  const link = [...document.querySelectorAll('a[href]')].find((element) => {
    if (element.origin !== location.origin || element.getAttribute('href').startsWith('#') || element.hasAttribute('download') || (element.target && element.target !== '_self')) {
      return false;
    }

    const page = toPage(new URL(element.href));

    return page && page !== currentPage && pages.includes(page) && isTabbable(element);
  });

  if (!link) {
    return null;
  }

  link.setAttribute('data-postdoc-navigation-link', '');
  window.__postdocNavigationMark = true;

  return { page: toPage(new URL(link.href)), description: describe(link) };
}

// Runs in the browser.
function getNavigationState() {
  return {
    isMarked: window.__postdocNavigationMark === true,
    url: location.href,
    isReady: document.documentElement.hasAttribute('data-postdoc-ready')
  };
}

// Runs in the browser. Calls back with the live region that announced the page title,
// or null if none did in time.
function waitForAnnouncement(timeout, done) {
  const { describe } = window.__postdocChecks;
  const normalize = (text) => text.replace(/\s+/g, ' ').trim().toLowerCase();
  const start = Date.now();

  (function check() {
    const title = normalize(document.title);
    const region = title && [...document.querySelectorAll('[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], [role="log"]')]
      .find((element) => normalize(element.textContent).includes(title));

    if (region || Date.now() - start >= timeout) {
      done({ title: document.title, announcedBy: region ? describe(region, false) : null });
    } else {
      setTimeout(check, 50);
    }
  })();
}

// Runs in the browser.
function describeFocus() {
  const element = document.activeElement;

  return !element || element === document.body ? null : window.__postdocChecks.describe(element);
}

// Waits until the link's page is shown and ready. Polls from Node, because a reload
// would stop a script waiting in the browser.
async function waitForPage(browser, manifest, previousUrl) {
  const start = Date.now();

  while (Date.now() - start < manifest.readyTimeout) {
    const state = await browser.execute(getNavigationState).catch(() => null);

    if (state && state.url !== previousUrl && state.isReady) {
      return state;
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
  }

  return null;
}

async function pressKey(browser, key) {
  await browser.actions({ async: true }).sendKeys(key).perform();
}

/**
 * Follows a link from one of the first pages to another page, the way a keyboard user
 * does, and compares the result to opening that page with a page load.
 */
export async function checkNavigation(browser, manifest) {
  let link = null;
  let sourceUrl = null;

  for (const pageUrl of manifest.pages.slice(0, MAX_SOURCE_PAGES)) {
    // A page that doesn't finish rendering fails its own test case, so the next one is tried.
    if (!await openPage(browser, manifest, pageUrl, { report: false })) {
      continue;
    }

    await installToolkit(browser);
    link = await browser.execute(findPageLink, [manifest.pages, manifest.baseUrl]);

    if (link) {
      sourceUrl = pageUrl;

      break;
    }
  }

  if (!link) {
    browser.assert.ok(true, 'None of the first pages links to another page, so navigation without reloads wasn\'t checked');

    return;
  }

  const { url: previousUrl } = await browser.execute(getNavigationState);

  await browser.execute(function () {
    document.querySelector('[data-postdoc-navigation-link]').focus();
  });
  await pressKey(browser, ENTER);

  const state = await waitForPage(browser, manifest, previousUrl);

  if (!state) {
    reportProblem(browser, createReportError(`Pressing Enter on ${link.description} in ${sourceUrl} didn't open ${link.page} within ${manifest.readyTimeout} ms.`));

    return;
  }

  if (!state.isMarked) {
    browser.assert.ok(true, `The link to ${link.page} opened it with a page load, so navigation without reloads wasn't checked`);

    return;
  }

  const announcement = await browser.executeAsync(waitForAnnouncement, [ANNOUNCEMENT_TIMEOUT]);

  await pressKey(browser, TAB);

  const firstStop = await browser.execute(describeFocus);

  // The same page, opened with a page load, is what the result should match.
  if (!await openPage(browser, manifest, link.page)) {
    return;
  }

  await installToolkit(browser);

  const loadedTitle = await browser.getTitle();

  await pressKey(browser, TAB);

  const loadedFirstStop = await browser.execute(describeFocus);
  const where = `After following the link to ${link.page} from ${sourceUrl}, which PostDoc shows without a reload`;
  let problemCount = 0;

  if (announcement.title !== loadedTitle) {
    problemCount++;
    reportProblem(browser, createReportError(
      `${where}, the page title is "${announcement.title}" instead of "${loadedTitle}".`,
      'https://www.w3.org/WAI/WCAG22/Understanding/page-titled.html'
    ));
  }

  if (!announcement.announcedBy) {
    problemCount++;
    reportProblem(browser, createReportError(
      `${where}, no live region announces the new page, so screen reader users aren't told that the page changed.`
    ));
  }

  if (firstStop !== loadedFirstStop) {
    problemCount++;
    reportProblem(browser, createReportError(
      `${where}, Tab moves the focus to ${firstStop ?? 'nothing on the page'}. After a page load, it moves it to ${loadedFirstStop ?? 'nothing on the page'}.`,
      'https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html'
    ));
  }

  if (!problemCount) {
    browser.assert.ok(true, `Following a link to ${link.page} without a reload announces the page, and Tab starts from the top of it`);
  }
}
