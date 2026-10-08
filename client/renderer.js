import Snapshot from './snapshot.js';

export default class Renderer {
  #session;
  #pageLoaded;
  #currentSnapshot = new Snapshot(document);
  #preFetchCache = new Set();

  constructor(session) {
    this.#session = session;
  }

  get currentSnapshot() {
    return this.#currentSnapshot;
  }

  get currentUrl() {
    return new URL(location.href);
  }

  init() {
    this.setup();

    if (this.#session.configuration.session?.enable_prefetch) {
      this.#setupEventDelegation();
    }
  }

  async render(nextSnapshot) {
    await nextSnapshot.into(this.#currentSnapshot);
  }

  #setupEventDelegation() {
    const body = this.#currentSnapshot.body;

    body.addEventListener('mouseover', this.#handleMouseover.bind(this));
  }

  #setupAnchorTraps() {
    this.currentSnapshot.documentElement.addEventListener('click', this.#handleClick.bind(this));

/*
    Array.from(this.#currentSnapshot.body.querySelectorAll('a[href]'))
      .filter((element) => element.host === location.host)
      .filter((element) => !element.getAttribute('href').startsWith('#'))
      .forEach((element) =>
        element.addEventListener('click', async (event) => {
          event.preventDefault();

          const url = new URL(element.href);

          await this.#session.navigator.navigateTo(url);
        })
      );
*/
  }

  // A link is shown in place when it leads to a page of this site: not an in-page
  // anchor, not meant for another tab or for downloading, and not a file such as a PDF.
  #isPageLink(element) {
    if (!element || element.host !== location.host || element.getAttribute('href').startsWith('#')) {
      return false;
    }

    if (element.hasAttribute('download') || (element.target && element.target !== '_self')) {
      return false;
    }

    const extension = element.pathname.match(/\.([^./]+)$/)?.[1];

    return !extension || extension === 'html';
  }

  #handleClick(event) {
    // Clicks with a modifier key open a new tab or window, so the browser handles them.
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    const element = event.target.closest('a[href]');

    if (this.#isPageLink(element)) {
      event.preventDefault();

      this.#session.navigator.navigateTo(element.href).catch(err => console.error('Navigation error:', err));
    }
  }

  #handleMouseover(event) {
    const element = event.target.closest('a[href]');
    if (this.#isPageLink(element)) {
      const url = new URL(element.href);

      if (!this.#preFetchCache.has(url.href)) {
        fetch(url, { headers: { Accept: 'text/html' } }).then(() => {
          this.#preFetchCache.add(url.href);
        }).catch(err => console.error('Fetch error:', err));
      }
    }
  }

  setup() {

    globalThis.PostDoc = globalThis.PostDoc || {};

    if (globalThis.PostDoc.initialized) {
      return;
    }

    if (!this.#session.configuration.session?.disable_spa) {
      this.#setupAnchorTraps();
    }

    addEventListener('load', async () => {
      // Span execution until the next microtask, so the very first popstate event will be skipped.
      await Promise.resolve();
      this.#pageLoaded = true;
    });

    window.addEventListener('popstate', async (event) => {
      // A part of the page that made a step in the history of its own, such as a
      // playground over the whole page, takes the step first, and the page stays.
      const claim = new CustomEvent('postdoc:popstate', { cancelable: true, detail: { state: event.state } });

      if (!window.dispatchEvent(claim)) {
        return;
      }

      if (this.#shouldHandlePopStateEvent()) {
        const scrollPosition = event.state?.scrollPosition || 0;

        if (location.href.includes('#')) {
          const target = this.#session.renderer.currentSnapshot.body.querySelector(`[id="${location.hash.slice(1)}"]`);
          if (target) {
            target.scrollIntoView();
          }
          return
        }
        this.#session.navigator.navigateTo(location.href, scrollPosition, false).catch(err => console.error('Navigation error:', err));
      }
    });

    window.addEventListener('hashchange', function (e) {
      e.preventDefault()
    })

    window.addEventListener('click', (e) => {
      const el = e.target;
      const timeoutIdMap = new WeakMap();

      if (el.matches('div[class*="language-"] > button.copy')) {
        const parent = el.parentElement;
        const sibling = parent?.querySelector(':scope > pre');

        if (!sibling) {
          return;
        }

        const isShell = /language-(shellscript|shell|bash|sh|zsh)/.test(
          parent.className
        )

        const ignoredNodes = ['.copy-ignore', '.diff.remove']
        const clone = sibling.cloneNode(true);
        clone
          .querySelectorAll(ignoredNodes.join(','))
          .forEach((node) => node.remove());

        let text = clone.textContent || '';

        if (isShell) {
          text = text.replace(/^ *(\$|>) /gm, '').trim();
        }

        copyToClipboard(text).then(() => {
          el.classList.add('copied');
          clearTimeout(timeoutIdMap.get(el));

          const timeoutId = setTimeout(() => {
            el.classList.remove('copied');
            el.blur();
            timeoutIdMap.delete(el);
          }, 2000);

          timeoutIdMap.set(el, timeoutId);
        })
      }
    });

    globalThis.PostDoc.initialized = true;
  }

  #shouldHandlePopStateEvent() {
    return (
      this.#pageLoaded || this.currentSnapshot.readyState === 'complete'
    );
  }
}

async function copyToClipboard(text) {
  try {
    return navigator.clipboard.writeText(text)
  } catch {
    const element = document.createElement('textarea')
    const previouslyFocusedElement = document.activeElement

    element.value = text

    // Prevent keyboard from showing on mobile
    element.setAttribute('readonly', '')

    element.style.contain = 'strict'
    element.style.position = 'absolute'
    element.style.left = '-9999px'
    element.style.fontSize = '12pt' // Prevent zooming on iOS

    const selection = document.getSelection()
    const originalRange = selection
      ? selection.rangeCount > 0 && selection.getRangeAt(0)
      : null

    document.body.appendChild(element)
    element.select()

    // Explicit selection workaround for iOS
    element.selectionStart = 0
    element.selectionEnd = text.length

    document.execCommand('copy')
    document.body.removeChild(element)

    if (originalRange && selection) {
      selection.removeAllRanges();
      selection.addRange(originalRange);
    }

    // Get the focus back on the previously focused element, if any
    if (previouslyFocusedElement) {
      previouslyFocusedElement.focus()
    }
  }
}
