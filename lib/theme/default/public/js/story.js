// Story pages: the storymaps' maps stick below the top bar, which grows with larger text,
// and the chapter bar shows which chapter the reader is in.

// Use globalThis.PostDoc directly so this file works both when Vite-transformed
// and when injected by the SPA navigator (where bare specifiers aren't resolved).
function onRender(callback, options) {
  if (globalThis.PostDoc && globalThis.PostDoc.navigator) {
    globalThis.PostDoc.navigator.registerOnRenderCallback(callback, options);
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => callback());
  } else {
    callback();
  }
}

let topObserver;
let pageEvents;

// The current chapter is the last one whose heading has come up a third of the way
// into the window, or the last chapter at the end of the page, which may not scroll
// that far.
function findCurrentChapter(headings) {
  const line = innerHeight / 3;
  const isAtEnd = scrollY + innerHeight >= document.documentElement.scrollHeight - 2;

  return isAtEnd ? headings.at(-1) : headings.findLast((heading) => heading.getBoundingClientRect().top <= line);
}

function showCurrentChapter(links, headings) {
  const current = findCurrentChapter(headings);

  links.forEach((link, index) => {
    if (headings[index] === current) {
      link.setAttribute('aria-current', 'location');

      // The chapter bar scrolls to show the link, without scrolling the page.
      const bar = link.closest('.storyChapters');
      const linkLeft = link.offsetLeft - bar.offsetLeft;

      if (linkLeft < bar.scrollLeft || linkLeft + link.offsetWidth > bar.scrollLeft + bar.clientWidth) {
        bar.scrollTo({ left: linkLeft - 16 });
      }
    } else {
      link.removeAttribute('aria-current');
    }
  });
}

onRender(
  () => {
    topObserver?.disconnect();
    pageEvents?.abort();

    const top = document.querySelector('.storyTop');

    if (!top) {
      return;
    }

    topObserver = new ResizeObserver(() => {
      document.documentElement.style.setProperty('--story-top-height', `${top.offsetHeight}px`);
    });
    topObserver.observe(top);

    const links = [...top.querySelectorAll('.storyChapters a')];
    const headings = links.map((link) => document.getElementById(decodeURIComponent(link.hash.slice(1))));

    if (!links.length || headings.includes(null)) {
      return;
    }

    let isScheduled = false;

    pageEvents = new AbortController();
    addEventListener('scroll', () => {
      if (!isScheduled) {
        isScheduled = true;
        requestAnimationFrame(() => {
          isScheduled = false;
          showCurrentChapter(links, headings);
        });
      }
    }, { passive: true, signal: pageEvents.signal });

    showCurrentChapter(links, headings);
  },
  {
    forPage() {
      return true;
    }
  }
);
