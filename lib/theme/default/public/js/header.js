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

onRender(
  () => {
    pageEvents?.abort();
    pageEvents = new AbortController();

    const { signal } = pageEvents;

    // The menu of narrow windows.
    const menuButton = document.querySelector('.menuButton');
    const menu = document.querySelector('.docThemeContainer');
    const isMenuOpen = () => Boolean(menu?.classList.contains('docThemeContainerVisible'));

    // While the menu is open over the page, the page behind it is inert, so the keyboard
    // and assistive technology stay in the menu.
    const setMenuOpen = (open) => {
      menu.classList.toggle('docThemeContainerVisible', open);
      menuButton.setAttribute('aria-expanded', String(open));
      document.body.style.overflow = open ? 'hidden' : null;

      [...document.body.children]
        .filter((element) => !element.contains(menu) && !['dialog', 'script'].includes(element.localName))
        .forEach((element) => {
          element.inert = open;
        });
    };

    if (menuButton && menu) {
      menuButton.addEventListener('click', () => setMenuOpen(!isMenuOpen()), { signal });

      // On a wider window, the menu is part of the header, so it's no longer open over
      // the page.
      matchMedia('(min-width: 992px)').addEventListener('change', (event) => {
        if (event.matches && isMenuOpen()) {
          setMenuOpen(false);
        }
      }, { signal });
    }

    // The search dialog. It opens with the focus in it, and Escape or a click beside its
    // box closes it, with the focus back on the button that opened it, or on the menu's
    // button when that one is in the closed menu.
    const searchDialog = document.getElementById('mySearchModal');
    let searchOpener = null;

    if (searchDialog) {
      document.querySelectorAll('.searchBtn, .searchBarMobile').forEach((button) => {
        button.addEventListener('click', () => {
          searchOpener = button;

          if (isMenuOpen()) {
            setMenuOpen(false);
          }

          if (typeof searchDialog.showModal === 'function') {
            searchDialog.showModal();
          } else {
            // A header of your own with an older search box, which isn't a dialog.
            searchDialog.style.display = 'block';
          }

          searchDialog.querySelector('input')?.focus();
        }, { signal });
      });

      searchDialog.addEventListener('click', (event) => {
        if (event.target === searchDialog) {
          if (typeof searchDialog.close === 'function') {
            searchDialog.close();
          } else {
            searchDialog.style.display = 'none';
          }
        }
      }, { signal });

      searchDialog.addEventListener('close', () => {
        (searchOpener?.getClientRects().length ? searchOpener : menuButton)?.focus();
      }, { signal });
    }

    // The versions menu.
    const versionButton = document.getElementById('dropdownBtn');
    const versionMenu = document.getElementById('versionMenu');
    const versions = versionButton?.parentElement;
    const isVersionMenuOpen = () => Boolean(versionMenu && !versionMenu.hidden);

    const setVersionMenuOpen = (open) => {
      versionMenu.hidden = !open;
      versionButton.setAttribute('aria-expanded', String(open));
    };

    if (versionButton && versionMenu) {
      versionButton.addEventListener('click', () => setVersionMenuOpen(!isVersionMenuOpen()), { signal });

      // The menu closes when a click goes elsewhere.
      document.addEventListener('click', (event) => {
        if (isVersionMenuOpen() && !versions.contains(event.target)) {
          setVersionMenuOpen(false);
        }
      }, { signal });
    }

    // Escape closes the versions menu, or else the menu of narrow windows. The search
    // dialog closes itself.
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') {
        return;
      }

      if (isVersionMenuOpen()) {
        setVersionMenuOpen(false);
        versionButton.focus();
      } else if (isMenuOpen()) {
        setMenuOpen(false);
        menuButton.focus();
      }
    }, { signal });
  },
  {
    forPage() {
      return true;
    }
  }
);

// The header stays at the top of the window on most pages, and its height depends on
// what's in it. Content that sticks to the top of the window, like a storymap's map,
// goes below it.
let headerObserver;

onRender(
  () => {
    const header = document.getElementById('topHeaderComponent');

    headerObserver?.disconnect();

    if (!header) {
      return;
    }

    headerObserver = new ResizeObserver(() => {
      const height = getComputedStyle(header).position === 'fixed' ? header.offsetHeight : 0;

      document.documentElement.style.setProperty('--pd-header-height', `${height}px`);
    });
    headerObserver.observe(header);
  },
  {
    forPage() {
      return true;
    }
  }
);
