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

onRender(
  () => {
    // Dark mode toggle
    const toggle = document.getElementById("modeToggle");

    if (toggle) {
      function setTheme(theme) {
        document.documentElement.setAttribute("data-theme", theme);
        localStorage.setItem("theme", theme);
      }

      toggle.addEventListener("change", () => {
        setTheme(toggle.checked ? "dark" : "light");
      });

      const savedTheme = localStorage.getItem("theme");
      if (savedTheme) {
        setTheme(savedTheme);
        toggle.checked = savedTheme === "dark";
      } else {
        setTheme("light");
      }
    }

    // Sidebar accordion toggle
    const accordionHeaders = document.querySelectorAll('.accordion-header');
    accordionHeaders.forEach(header => {
      header.addEventListener('click', () => {
        const index = header.getAttribute('data-index');
        const accordionItems = document.querySelectorAll('.accordion-item');
        accordionItems.forEach((item, i) => {
          if (i + 1 === parseInt(index)) {
            item.classList.toggle('active');
          } else {
            item.classList.remove('active');
          }
        });
      });
    });

    // Client-side sidebar preselection after SPA navigation
    const currentPath = window.location.pathname;
    const sidebarLinks = document.querySelectorAll('#left-sidebar .accordion-content a');
    let matched = false;
    sidebarLinks.forEach(function(link) {
      const href = link.getAttribute('href') || '';
      const linkPath = new URL(href, window.location.origin).pathname;
      if (linkPath === currentPath) {
        link.classList.add('active');
        const accordionItem = link.closest('.accordion-item');
        if (accordionItem && !accordionItem.classList.contains('active')) {
          accordionItem.classList.add('active');
        }
        matched = true;
      } else {
        link.classList.remove('active');
      }
    });
    if (matched) {
      document.querySelectorAll('#left-sidebar .accordion-item').forEach(function(item) {
        if (!item.querySelector('.accordion-content a.active')) {
          item.classList.remove('active');
        }
      });
    }

    // Sub-group toggle (nested sidebar levels)
    document.querySelectorAll('#left-sidebar .accordion-sub-header').forEach(function(subHeader) {
      subHeader.addEventListener('click', function() {
        subHeader.parentElement.classList.toggle('open');
      });
    });
    // Auto-open sub-group containing active link
    document.querySelectorAll('#left-sidebar .accordion-sub-content a.active').forEach(function(link) {
      const subGroup = link.closest('.accordion-sub-group');
      if (subGroup) subGroup.classList.add('open');
    });

    // Sidebar filter
    const sidebarSearchInput = document.querySelector('#left-sidebar .left-sidebar-search input');
    if (sidebarSearchInput) {
      sidebarSearchInput.addEventListener('input', function() {
        const query = this.value.toLowerCase().trim();
        const items = document.querySelectorAll('#left-sidebar .accordion-item');
        items.forEach(function(item) {
          const header = item.querySelector('.accordion-header');
          const links = item.querySelectorAll('.accordion-content a');
          const headerText = header ? header.textContent.toLowerCase() : '';
          let childMatch = false;
          links.forEach(function(link) {
            if (link.textContent.toLowerCase().includes(query)) {
              childMatch = true;
              link.style.display = '';
            } else {
              link.style.display = query ? 'none' : '';
            }
          });
          if (!query) {
            item.style.display = '';
            item.classList.remove('filter-open');
          } else if (headerText.includes(query) || childMatch) {
            item.style.display = '';
            item.classList.add('filter-open');
          } else {
            item.style.display = 'none';
            item.classList.remove('filter-open');
          }
        });
      });
    }
  },
  {
    forPage() {
      return true;
    },
  },
);

// Pagefind search initialization
onRender(
  () => {
    const el = document.getElementById('pagefind-search');
    if (!el || el.childNodes.length > 0) return;

    function initPagefind() {
      if (typeof PagefindUI !== 'undefined') {
        new PagefindUI({ element: '#pagefind-search', showSubResults: true });
      }
    }

    if (!document.querySelector('link[href*="pagefind-ui.css"]')) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/pagefind/pagefind-ui.css';
      link.onerror = function() { this.remove(); };
      document.head.appendChild(link);
    }

    if (!document.querySelector('script[src*="pagefind-ui.js"]')) {
      var s = document.createElement('script');
      s.src = '/pagefind/pagefind-ui.js';
      s.onload = initPagefind;
      s.onerror = function() {};
      document.head.appendChild(s);
    } else {
      initPagefind();
    }
  },
  {
    forPage() {
      return true;
    },
  },
);

// Highlight right sidebar TOC links based on scroll position
onRender(
  () => {
    const contentEl = document.getElementById("content");
    const sidebarEl = document.getElementById("right-sidebar");
    if (!contentEl || !sidebarEl) return;

    const sidebarLinks = Array.from(sidebarEl.querySelectorAll(".innerList li a"));
    if (!sidebarLinks.length) return;

    const headings = sidebarLinks.map(function(link) {
      const id = link.getAttribute("href").replace(/^#/, "");
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

      sidebarLinks.forEach(function(link) { link.classList.remove("active"); });
      if (sidebarLinks[activeIndex]) {
        sidebarLinks[activeIndex].classList.add("active");
      }
    }

    updateActive();
    window.addEventListener("scroll", updateActive);
  },
  {
    forPage: /guide|api_reference|getting-started|about/,
  },
);

// Mermaid rendering
onRender(
  async () => {
    const mermaidEls = document.querySelectorAll("pre.mermaid");
    if (!mermaidEls.length) return;

    try {
      const { default: mermaid } = await import(
        "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs"
      );
      const isDark = document.documentElement.getAttribute("data-theme") === "dark";
      mermaid.initialize({ startOnLoad: false, theme: isDark ? "dark" : "default" });
      await mermaid.run({ nodes: mermaidEls });
    } catch (e) {
      console.warn("Mermaid rendering failed:", e);
    }
  },
  {
    forPage: /guide|api_reference|about|getting-started/,
  },
);
