import Snapshot from './snapshot.js';

// Set on <html> once a page has finished rendering, so tests know when to start.
export const READY_ATTRIBUTE = 'data-postdoc-ready';

function djb2Hash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    // bitwise shift hash left 5 places, then add hash and the char code
    hash = (hash << 5) + hash + char;
  }

  return hash.toString(16);
}

function getUniqueKey(fn, urlTest = '/') {
  const urlKey = urlTest instanceof RegExp ? `RegExp(${urlTest.source})` : urlTest.toString();
  const fnString = fn.toString();

  return djb2Hash(fnString + urlKey);
}


// A page load tells assistive technology that the page has changed, and the next Tab
// starts from the top of the new page. Showing a page in place does neither, so the
// navigator does both itself.
const ANNOUNCER_ID = 'postdoc-announcer';
const ANNOUNCEMENT_DELAY = 100;

// How long the scrolling has to stop before its position is saved. Safari throws when
// the history state is replaced more than 100 times in 10 seconds.
const SCROLL_SAVE_DELAY = 150;

// Focuses an element without scrolling to it and without making it a Tab stop. An
// element that can't take the focus can while it has it.
function focusWithoutScrolling(element, keepsTabIndex) {
  const tabIndex = element.getAttribute('tabindex');

  if (tabIndex === null) {
    element.setAttribute('tabindex', '-1');
  }

  element.focus({ preventScroll: true });

  if (tabIndex !== null) {
    return;
  }

  if (keepsTabIndex) {
    element.addEventListener('blur', () => element.removeAttribute('tabindex'), { once: true });
  } else {
    element.removeAttribute('tabindex');
  }
}

// The focus goes to the element the URL points to, or to an element with autofocus, or
// to the start of the page, unless an onRender callback has already moved it.
function moveFocusToNewPage(target) {
  if (document.activeElement && document.activeElement !== document.body) {
    return;
  }

  const autofocused = document.querySelector('[autofocus]');

  if (target) {
    focusWithoutScrolling(target, true);
  } else if (autofocused) {
    autofocused.focus();
  } else {
    // Focusing <body> makes the next Tab start from the top of the page.
    focusWithoutScrolling(document.body, false);
  }
}

// Screen readers announce what changes in a live region. The region is new with every
// page, so it's added empty and filled a moment later, once they're aware of it.
function announcePage() {
  const announcer = document.createElement('div');

  announcer.id = ANNOUNCER_ID;
  announcer.setAttribute('aria-live', 'assertive');
  announcer.setAttribute('aria-atomic', 'true');
  announcer.style.cssText = 'position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; border: 0; ' +
    'overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap;';

  document.getElementById(ANNOUNCER_ID)?.remove();
  document.body.append(announcer);

  setTimeout(() => {
    announcer.textContent = document.title || document.querySelector('h1')?.textContent.trim() || location.pathname;
  }, ANNOUNCEMENT_DELAY);
}

export default class Navigator {
  #session;
  #beforeLeavingSnapshotCallbacks = [];
  #afterRenderingSnapshotCallbacks = new Map();
  #pendingRenders = new Set();
  #scrollSaveTimeout;

  constructor(session) {
    this.#session = session;
  }

  // Each history entry keeps the scroll position of its page, so Back and Forward can
  // restore it. It's saved as the reader scrolls, because by the time a popstate event
  // arrives, the entry that was left is no longer the one that can be changed.
  keepScrollPositions() {
    addEventListener('scroll', () => {
      clearTimeout(this.#scrollSaveTimeout);
      this.#scrollSaveTimeout = setTimeout(() => this.#saveScrollPosition(window.scrollY), SCROLL_SAVE_DELAY);
    }, { passive: true });
  }

  #saveScrollPosition(scrollPosition) {
    clearTimeout(this.#scrollSaveTimeout);
    history.replaceState({ ...history.state, scrollPosition }, '');
  }

  get currentUrl() {
    return new URL(location.href);
  }

  registerOnLeaveCallback(callback, options) {
    const registeredOn = this.currentUrl;

    this.#beforeLeavingSnapshotCallbacks.push({
      test: this.#createURLMatchFunction(registeredOn, options?.forPage),
      fn: callback
    });
  }

  registerOnRenderCallback(callback, options) {
    const registeredOn = this.currentUrl;
    const test = this.#createURLMatchFunction(registeredOn, options?.forPage);
    const key = getUniqueKey(callback, options?.forPage);

    const callbackItem = { test, fn: callback, key, index: options?.index ?? 0 };

    if (!this.#afterRenderingSnapshotCallbacks.has(key)) {
      this.#afterRenderingSnapshotCallbacks.set(key, callbackItem);

      if (test(registeredOn)) {
        this.#trackRender(callback(registeredOn));
      }
    }
  }

  async navigateTo(url, scrollPosition = 0, changeState = true) {
    url = url instanceof URL ? url : new URL(url, this.currentUrl.origin);

    // The position on the page that's left, before the next page changes it. After Back
    // or Forward, a position still waiting to be saved would go to the wrong entry.
    const leftScrollPosition = window.scrollY;
    clearTimeout(this.#scrollSaveTimeout);

    document.documentElement.removeAttribute(READY_ATTRIBUTE);

    const nextSnapshot = await this.prepareSnapshotFor(url);
    await this.#callLeaveCallbacks(url);
    await this.#session.renderer.render(nextSnapshot);

    if (changeState) {
      this.#saveScrollPosition(leftScrollPosition);
      history.pushState(null, '', url.href);
    }

    await this.#callRenderCallbacks();

    const target = url.hash.length
      ? this.#session.renderer.currentSnapshot.body.querySelector(`[id="${url.hash.slice(1)}"]`)
      : null;

    if (target) {
      target.scrollIntoView();
    } else {
      window.scrollTo(0, scrollPosition);
    }

    moveFocusToNewPage(target);
    announcePage();

    await this.signalReady();
  }

  // Waits for the onRender callbacks of the current page, including the async work
  // they return, and for its fonts, then marks the page as ready.
  async signalReady() {
    while (this.#pendingRenders.size) {
      await Promise.all(this.#pendingRenders);
    }

    await document.fonts?.ready;

    document.documentElement.setAttribute(READY_ATTRIBUTE, '');
  }

  #trackRender(result) {
    if (typeof result?.then !== 'function') {
      return;
    }

    const render = Promise.resolve(result)
      .catch((error) => console.error('An onRender callback failed:', error))
      .finally(() => this.#pendingRenders.delete(render));

    this.#pendingRenders.add(render);
  }

  reload() {
    location.reload();
  }

  async #callRenderCallbacks() {
    const url = this.currentUrl;

    const callbacks = Array.from(this.#afterRenderingSnapshotCallbacks.values()).sort((a, b) => a.index - b.index);

    for (const { fn, test } of callbacks) {
      if (test(url)) {
        await fn(url);
      }
    }
  }

  async #callLeaveCallbacks(nextUrl) {
    const url = this.currentUrl;

    const maybePromises = this.#beforeLeavingSnapshotCallbacks
      .filter(({ test }) => test(url))
      .map(({ fn }) => fn(url, nextUrl));

    await Promise.all(maybePromises);
  }

  #createURLMatchFunction(registeredOn, forPage) {
    if (!forPage) {
      return (url) => registeredOn.pathname === url.pathname;
    }

    if (forPage instanceof RegExp) {
      return (url) => forPage.test(url.href);
    }

    return forPage;
  }

  async prepareSnapshotFor(url) {
    const response = await fetch(url, {
      headers: {
        Accept: 'text/html'
      }
    });

    const html = await response.text();

    return Snapshot.from(html, url);
  }
}
