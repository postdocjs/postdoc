function onRender(callback, options) {
  if (globalThis.PostDoc && globalThis.PostDoc.navigator) {
    globalThis.PostDoc.navigator.registerOnRenderCallback(callback, options);
  } else {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => callback());
    } else {
      callback();
    }
  }
}

// The listeners on the document of the page that's shown, removed when the next page is.
let pageEvents;

// The sidebar and the table of contents are panels over the page on narrow windows,
// which open with the buttons above the content. While one is open, the page behind it
// doesn't scroll, and the keyboard stays in the panel. Its close button, Escape and a
// tap outside it close it, and so does a tap on one of its links, which shows where
// the link leads.
onRender(
  () => {
    pageEvents?.abort();
    pageEvents = new AbortController();

    const { signal } = pageEvents;

    const panels = [
      ['#sideMenuButton', '#left-sidebar', '#closeLeftSidebarButton'],
      ['#modalButton', '.right-sidebar-container', '.right-sidebar-close-button']
    ]
      .map(([buttonSelector, panelSelector, closeSelector]) => ({
        button: document.querySelector(buttonSelector),
        panel: document.querySelector(panelSelector),
        closeButton: document.querySelector(closeSelector)
      }))
      .filter(({ button, panel }) => button && panel);

    const isOpen = ({ panel }) => panel.classList.contains('open');

    const close = (entry, shouldFocusButton = false) => {
      entry.panel.classList.remove('open');
      entry.button.setAttribute('aria-expanded', 'false');

      if (!panels.some(isOpen)) {
        document.body.classList.remove('overflow-hidden');
      }

      if (shouldFocusButton) {
        entry.button.focus();
      }
    };

    const open = (entry) => {
      panels.filter(isOpen).forEach((other) => close(other));

      entry.panel.classList.add('open');
      entry.button.setAttribute('aria-expanded', 'true');
      document.body.classList.add('overflow-hidden');

      (entry.closeButton || entry.panel.querySelector('a, input, button'))?.focus();
    };

    for (const entry of panels) {
      const { button, panel, closeButton } = entry;

      button.setAttribute('aria-expanded', 'false');
      button.addEventListener('click', () => (isOpen(entry) ? close(entry) : open(entry)), { signal });
      closeButton?.addEventListener('click', () => close(entry, true), { signal });

      panel.addEventListener('click', (event) => {
        if (isOpen(entry) && event.target.closest('a[href]')) {
          close(entry);
        }
      }, { signal });

      document.addEventListener('click', (event) => {
        if (isOpen(entry) && !panel.contains(event.target) && !button.contains(event.target)) {
          close(entry);
        }
      }, { signal });

      document.addEventListener('keydown', (event) => {
        if (!isOpen(entry)) {
          return;
        }

        if (event.key === 'Escape') {
          close(entry, true);

          return;
        }

        if (event.key !== 'Tab') {
          return;
        }

        // The links in a closed section aren't shown, although they have a box.
        const stops = [...panel.querySelectorAll('a[href], button, input, summary, [tabindex="0"]')]
          .filter((element) => element.checkVisibility
            ? element.checkVisibility({ visibilityProperty: true })
            : element.getClientRects().length > 0);
        const first = stops[0];
        const last = stops.at(-1);

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }, { signal });
    }

    // On a wide window, the panels are columns beside the content.
    matchMedia('(min-width: 993px)').addEventListener('change', (event) => {
      if (event.matches) {
        panels.filter(isOpen).forEach((entry) => close(entry));
      }
    }, { signal });
  },
  {
    // On every page, not only the one the script was first loaded on. Pages without
    // the panels' buttons have nothing to set up.
    forPage() {
      return true;
    }
  }
);
