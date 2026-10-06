/**
 * Helpers the page checks use in the browser. A function that runs in the browser is
 * sent there as source code, so it can't call functions defined next to it. The checks
 * install these helpers on the page instead, and find them on `window`.
 */

export async function installToolkit(browser) {
  await browser.execute(defineToolkit);
}

// Runs in the browser, so everything it uses is defined inside.
function defineToolkit() {
  if (window.__postdocChecks) {
    return;
  }

  const NATIVELY_FOCUSABLE = 'a[href], area[href], button, input:not([type="hidden"]), select, textarea, iframe, summary, ' +
    'audio[controls], video[controls], [contenteditable]:not([contenteditable="false"])';
  const FOCUSABLE = NATIVELY_FOCUSABLE + ', [tabindex]';
  const LANDMARKS = ['header', 'footer', 'main', 'nav', 'aside', 'form', 'dialog'];
  const MAX_NAME_LENGTH = 40;

  const isIgnored = (element, selectors = []) => selectors.some((selector) => element.closest(selector));

  // The boxes an element is drawn in. An element without a size of its own, such as
  // a link around a block image, is drawn in its children's boxes.
  function getRects(element, depth = 0) {
    const rects = [...element.getClientRects()].filter((rect) => rect.width >= 2 && rect.height >= 2);

    return rects.length || depth > 2 ? rects : [...element.children].flatMap((child) => getRects(child, depth + 1));
  }

  // Whether the element is drawn somewhere on the page, which may be outside the window.
  function isOnPage(element) {
    return (element.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) ?? true) &&
      getRects(element).some((rect) => rect.right + scrollX > 0 && rect.bottom + scrollY > 0);
  }

  // A hidden checkbox or radio button is usually shown by its label.
  const getShownBox = (element) => [element, ...(element.labels ?? [])].find(isOnPage);

  // Whether Tab can move the focus to the element.
  const isTabbable = (element) => element.matches(FOCUSABLE) && element.tabIndex >= 0 && !element.matches(':disabled') && isOnPage(element);

  // Content that isn't displayed, such as the dark-mode version of an icon, isn't part
  // of a name, unless aria-labelledby points to it.
  function getText(node, includesHidden = false) {
    if (!node) {
      return '';
    }

    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent;
    }

    if (
      node.nodeType !== Node.ELEMENT_NODE ||
      node.getAttribute('aria-hidden') === 'true' ||
      ['script', 'style'].includes(node.localName) ||
      (!includesHidden && node.checkVisibility?.({ visibilityProperty: true }) === false)
    ) {
      return '';
    }

    if (node.getAttribute('aria-label')) {
      return ` ${node.getAttribute('aria-label')} `;
    }

    if (node.localName === 'img') {
      return ` ${node.getAttribute('alt') ?? ''} `;
    }

    return [...node.childNodes].map((child) => getText(child, includesHidden)).join('');
  }

  // A simplified accessible name: enough to tell a named control from an unnamed one.
  function getName(element) {
    const labelledBy = element.getAttribute('aria-labelledby');
    const takesNameFromContent = !element.matches('input, select, textarea');

    return [
      labelledBy && labelledBy.split(/\s+/).map((id) => getText(document.getElementById(id), true)).join(' '),
      element.getAttribute('aria-label'),
      ...[...(element.labels ?? [])].map((label) => getText(label)),
      element.matches('input[type="submit"], input[type="reset"], input[type="button"]') && (element.value || element.type),
      element.matches('input[type="image"]') && element.alt,
      takesNameFromContent && getText(element),
      element.getAttribute('title'),
      element.getAttribute('placeholder')
    ].map((value) => (value || '').replace(/\s+/g, ' ').trim()).find(Boolean) ?? '';
  }

  function describeStep(node) {
    const className = node.classList[0];
    const sameTagSiblings = node.parentElement ? [...node.parentElement.children].filter((child) => child.localName === node.localName) : [];

    return node.localName +
      (className ? '.' + CSS.escape(className) : '') +
      (sameTagSiblings.length > 1 ? `:nth-of-type(${sameTagSiblings.indexOf(node) + 1})` : '');
  }

  // A CSS selector for the element, short enough to read in a report, and its name.
  // It starts from the closest element with an id or a landmark, such as the footer,
  // so the reader knows which part of the page to look at.
  function describe(element, withName = true) {
    const steps = [];
    let node = element;

    for (; node && node !== document.body && !node.id && !LANDMARKS.includes(node.localName) && steps.length < 3; node = node.parentElement) {
      steps.unshift(describeStep(node));
    }

    let anchor = node;

    while (anchor && anchor !== document.body && !anchor.id && !LANDMARKS.includes(anchor.localName)) {
      anchor = anchor.parentElement;
    }

    const start = anchor?.id ? '#' + CSS.escape(anchor.id) : anchor && anchor !== document.body ? anchor.localName : '';
    const selector = node === anchor ? [start, ...steps].filter(Boolean).join(' > ') : [start, steps.join(' > ')].filter(Boolean).join(' ');

    const name = withName ? getName(element) : '';
    const shortName = name.length > MAX_NAME_LENGTH ? name.slice(0, MAX_NAME_LENGTH - 1) + '…' : name;

    return (selector || element.localName) + (shortName ? ` ("${shortName}")` : '');
  }

  // Transitions would be measured halfway, and smooth scrolling would still be moving
  // the page. Checks freeze them while they work and release them when they're done.
  const motionStyle = document.createElement('style');
  motionStyle.textContent = '*, *::before, *::after { transition-duration: 0s !important; transition-delay: 0s !important; ' +
    'animation-duration: 0s !important; animation-delay: 0s !important; scroll-behavior: auto !important; }';
  let motionFreezes = 0;

  function freezeMotion() {
    if (motionFreezes++ === 0) {
      document.head.append(motionStyle);
    }
  }

  function releaseMotion() {
    if (motionFreezes > 0 && --motionFreezes === 0) {
      motionStyle.remove();
    }
  }

  // Selectors that aren't supported, such as :modal in an older browser, match nothing.
  function matchesSafely(element, selector) {
    try {
      return element.matches(selector);
    } catch {
      return false;
    }
  }

  // Dialogs that are open: <dialog> elements, and others drawn on the page.
  const getOpenDialogs = () => [...document.querySelectorAll('dialog, [role="dialog"], [role="alertdialog"], [aria-modal="true"]')]
    .filter((element) => element.localName === 'dialog' ? element.open : isOnPage(element));

  const getOpenPopovers = () => [...document.querySelectorAll('[popover]')].filter((element) => matchesSafely(element, ':popover-open'));

  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
  const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

  // Resolves once the page has stopped changing for a moment, or after the timeout:
  // for example, after a dialog has loaded its content.
  function waitForQuiet(quietTime = 100, timeout = 1500) {
    return new Promise((resolve) => {
      let isDone = false;
      let quietTimer;

      const finish = () => {
        if (isDone) {
          return;
        }

        isDone = true;
        observer.disconnect();
        clearTimeout(quietTimer);
        clearTimeout(deadline);
        requestAnimationFrame(() => resolve());
      };

      const observer = new MutationObserver(() => {
        clearTimeout(quietTimer);
        quietTimer = setTimeout(finish, quietTime);
      });
      const deadline = setTimeout(finish, timeout);

      observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
      quietTimer = setTimeout(finish, quietTime);
    });
  }

  window.__postdocChecks = {
    FOCUSABLE,
    isIgnored,
    getRects,
    isOnPage,
    getShownBox,
    isTabbable,
    getName,
    describe,
    matchesSafely,
    getOpenDialogs,
    getOpenPopovers,
    freezeMotion,
    releaseMotion,
    nextFrame,
    wait,
    waitForQuiet
  };
}
