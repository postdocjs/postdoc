// Use globalThis.PostDoc directly so this file works both when Vite-transformed
// and when injected by the SPA navigator (where bare specifiers aren't resolved).
function onRender(callback, options) {
  if (globalThis.PostDoc && globalThis.PostDoc.navigator) {
    globalThis.PostDoc.navigator.registerOnRenderCallback(callback, options);
  } else {
    // No SPA session — run the callback once on DOMContentLoaded or immediately
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => callback());
    } else {
      callback();
    }
  }
}

// The colour scheme. includes/color_scheme.ejs sets it before the page is painted, and
// this keeps it up to date: it's the reader's choice, light or dark, which is kept in
// localStorage, or else their system's. The header's theme switch makes the choice, and
// so does the dark mode checkbox of story pages and of headers of your own.
const THEME_KEY = 'theme';
const darkScheme = matchMedia('(prefers-color-scheme: dark)');

// The choice, while there's no storage to keep it in, such as in a private window.
let unstoredThemeChoice = null;

function getThemeChoice() {
  try {
    const theme = localStorage.getItem(THEME_KEY);

    return theme === 'light' || theme === 'dark' ? theme : 'system';
  } catch {
    return unstoredThemeChoice ?? 'system';
  }
}

function showTheme() {
  const choice = getThemeChoice();
  const theme = choice === 'system' ? (darkScheme.matches ? 'dark' : 'light') : choice;

  document.documentElement.setAttribute('data-theme', theme);

  document.querySelectorAll('.themeSwitch input').forEach((input) => {
    input.checked = input.value === choice;
  });

  const toggle = document.getElementById('modeToggle');

  if (toggle) {
    toggle.checked = theme === 'dark';
  }
}

function chooseTheme(choice) {
  try {
    if (choice === 'system') {
      localStorage.removeItem(THEME_KEY);
    } else {
      localStorage.setItem(THEME_KEY, choice);
    }
  } catch {
    // Without storage, the choice lasts until the next page load.
    unstoredThemeChoice = choice;
  }

  showTheme();
}

// The document stays as pages change, so these listen once.
darkScheme.addEventListener('change', () => {
  if (getThemeChoice() === 'system') {
    showTheme();
  }
});

document.addEventListener('change', ({ target }) => {
  if (!(target instanceof Element)) {
    return;
  }

  if (target.matches('.themeSwitch input')) {
    chooseTheme(target.value);
  } else if (target.id === 'modeToggle') {
    chooseTheme(target.checked ? 'dark' : 'light');
  }
});

onRender(showTheme, {
  forPage() {
    return true;
  }
});

// The sidebar's sections and groups open and close, and the ones with the current page
// in them start open. The ones the reader opens stay open from page to page, until the
// browser's tab is closed.
const OPEN_SECTIONS_KEY = 'postdoc-sidebar-open';

function readOpenSections() {
  try {
    const ids = JSON.parse(sessionStorage.getItem(OPEN_SECTIONS_KEY) || '[]');

    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

function rememberOpenSections(nav) {
  const sections = [...nav.querySelectorAll('details[data-nav-id]')];
  const ids = sections.map((details) => details.dataset.navId);
  // The other sidebar's sections, such as the API pages', are remembered as they were.
  const others = readOpenSections().filter((id) => !ids.includes(id));
  const open = sections.filter((details) => details.open).map((details) => details.dataset.navId);

  try {
    sessionStorage.setItem(OPEN_SECTIONS_KEY, JSON.stringify([...others, ...open]));
  } catch {
    // Without storage, sections close again on the next page.
  }
}

// Shows the pages whose titles have the text, with the sections and groups they're in
// open, and all the pages of a section or group whose title has it. Without text, the
// sections are as they were before.
function filterSidebar(nav, query, openBeforeFilter) {
  const sections = [...nav.querySelectorAll('details')];
  const linkItems = [...nav.querySelectorAll('li')].filter((item) => item.querySelector(':scope > a'));

  linkItems.forEach((item) => {
    item.hidden = Boolean(query) && !item.textContent.toLowerCase().includes(query);
  });

  // Groups come before the sections they're in, so a section can tell whether one of
  // its groups has a match.
  sections.reverse().forEach((details) => {
    const item = details.parentElement;

    if (!query) {
      item.hidden = false;
      details.open = openBeforeFilter.includes(details);

      return;
    }

    const titleMatches = details.querySelector(':scope > summary').textContent.toLowerCase().includes(query);

    if (titleMatches) {
      details.querySelectorAll('li').forEach((child) => {
        child.hidden = false;
      });
    }

    const hasMatch = titleMatches || [...details.querySelectorAll(':scope > ul > li')].some((child) => !child.hidden);

    item.hidden = !hasMatch;
    details.open = hasMatch;
  });

  return linkItems.filter((item) => !item.hidden && !item.parentElement.closest('li[hidden]')).length;
}

onRender(
  () => {
    const sidebar = document.getElementById('left-sidebar');
    const nav = sidebar?.querySelector('.sidebar-nav');

    if (!nav) {
      return;
    }

    const remembered = readOpenSections();

    nav.querySelectorAll('details[data-nav-id]').forEach((details) => {
      if (remembered.includes(details.dataset.navId)) {
        details.open = true;
      }
    });

    let isFiltering = false;

    // A toggle event doesn't bubble, but the nav can listen for it on the way down.
    nav.addEventListener('toggle', () => {
      if (!isFiltering) {
        rememberOpenSections(nav);
      }
    }, true);

    const input = sidebar.querySelector('.left-sidebar-search input');
    const status = nav.querySelector('.sidebar-filter-status');
    let openBeforeFilter = null;
    let lastQuery = '';

    const applyFilter = () => {
      const query = input.value.trim().toLowerCase();

      if (query === lastQuery) {
        return;
      }

      lastQuery = query;
      openBeforeFilter ??= [...nav.querySelectorAll('details')].filter((details) => details.open);
      isFiltering = Boolean(query);

      const count = filterSidebar(nav, query, openBeforeFilter);

      if (status) {
        status.textContent = !query ? '' : count === 1 ? '1 page matches' : `${count} pages match`;
      }

      if (!query) {
        openBeforeFilter = null;
      }
    };

    // The box's clear button fires `search`, and so does Escape in some browsers.
    input?.addEventListener('input', applyFilter);
    input?.addEventListener('search', applyFilter);
  },
  {
    forPage() {
      return true;
    }
  }
);

// Code group tabs, switched per group
onRender(
  () => {
    document.querySelectorAll('.code-group').forEach((group) => {
      const tabs = group.querySelectorAll('.nav-link');

      tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
          tabs.forEach((otherTab) => {
            const isSelected = otherTab === tab;

            otherTab.classList.toggle('active', isSelected);
            otherTab.setAttribute('aria-selected', String(isSelected));
            // Pane ids may start with a digit, which a CSS selector would reject.
            document.getElementById(otherTab.dataset.bsTarget.slice(1))?.classList.toggle('active', isSelected);
          });
        });
      });
    });
  },
  {
    forPage() {
      return true;
    }
  }
);

// Pagefind search initialization. When Pagefind's script can't be loaded, such as when
// Pagefind can't run where the site is built, the search box says so instead of
// staying empty.
let isSearchUnavailable = false;

function showSearchUnavailable() {
  isSearchUnavailable = true;

  const el = document.getElementById('pagefind-search');

  if (el && !el.childNodes.length) {
    el.innerHTML = '<p class="searchModal-message">Search couldn\'t be loaded.</p>';
  }
}

onRender(
  () => {
    const el = document.getElementById('pagefind-search');
    if (!el || el.childNodes.length > 0) {
      return;
    }

    if (isSearchUnavailable) {
      showSearchUnavailable();

      return;
    }

    // The site may be served from a subfolder, which the search index is in too.
    const pagefindPath = (globalThis.PostDoc?.configuration?.base ?? '/') + 'pagefind/';

    function initPagefind() {
      if (typeof PagefindUI !== 'undefined') {
        new PagefindUI({ element: '#pagefind-search', showSubResults: true, bundlePath: pagefindPath });
      }
    }

    if (!document.querySelector('link[href*="pagefind-ui.css"]')) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = pagefindPath + 'pagefind-ui.css';
      link.onerror = function() { this.remove() };
      document.head.appendChild(link);
    }

    if (!document.querySelector('script[src*="pagefind-ui.js"]')) {
      var s = document.createElement('script');
      s.src = pagefindPath + 'pagefind-ui.js';
      s.onload = initPagefind;
      s.onerror = showSearchUnavailable;
      document.head.appendChild(s);
    } else {
      initPagefind();
    }
  },
  {
    forPage() {
      return true;
    }
  }
);

// Highlight right sidebar TOC links based on scroll position
onRender(
  () => {
    const contentEl = document.getElementById('content');
    const sidebarEl = document.getElementById('right-sidebar');
    if (!contentEl || !sidebarEl) {
      return;
    }

    const sidebarLinks = Array.from(sidebarEl.querySelectorAll('.innerList li a'));
    if (!sidebarLinks.length) {
      return;
    }

    const headings = sidebarLinks.map(function(link) {
      const id = link.getAttribute('href').replace(/^#/, '');

      return document.getElementById(id);
    }).filter(Boolean);

    function updateActive() {
      const scrollPos = window.scrollY;
      let activeIndex = 0;

      for (let i = 0; i < headings.length; i++) {
        if (headings[i].offsetTop - 160 <= scrollPos) {
          activeIndex = i;
        }
      }

      sidebarLinks.forEach(function(link) { link.classList.remove('active') });
      if (sidebarLinks[activeIndex]) {
        sidebarLinks[activeIndex].classList.add('active');
      }
    }

    updateActive();
    window.addEventListener('scroll', updateActive);
  },
  {
    forPage: /guide|api_reference|getting-started|about/
  }
);

// Mermaid rendering
onRender(
  async () => {
    const mermaidEls = document.querySelectorAll('pre.mermaid');
    if (!mermaidEls.length) {
      return;
    }

    try {
      const { default: mermaid } = await import(
        'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs'
      );
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      mermaid.initialize({ startOnLoad: false, theme: isDark ? 'dark' : 'default' });
      await mermaid.run({ nodes: mermaidEls });

      // Mermaid puts aria-roledescription on a role that doesn't support it, so assistive
      // technology ignores it and axe reports it. Text alternatives come from accTitle
      // and accDescr in the diagram's source.
      mermaidEls.forEach((diagram) => diagram.querySelector('svg')?.removeAttribute('aria-roledescription'));
    } catch (e) {
      console.warn('Mermaid rendering failed:', e);
    }
  },
  {
    forPage: /guide|api_reference|about|getting-started/
  }
);
