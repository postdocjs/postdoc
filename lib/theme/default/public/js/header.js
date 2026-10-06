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

onRender(
  () => {
    const menuButton = document.querySelector(".menuButton");
    const docThemeContainer = document.querySelector(".docThemeContainer");

    if (menuButton && docThemeContainer) {
      menuButton.addEventListener("click", () => {
        docThemeContainer.classList.toggle("docThemeContainerVisible");

        document.body.style.overflow = docThemeContainer.classList.contains(
          "docThemeContainerVisible",
        )
          ? "hidden"
          : null;
      });
    }

    // Search modal
    const searchBox = document.querySelector(".docThemeSearchBox");
    const searchModal = document.getElementById("mySearchModal");

    if (searchBox && searchModal) {
      searchBox.addEventListener("click", function () {
        searchModal.style.display = "block";
      });

      searchModal.addEventListener("click", function (event) {
        if (event.target == this) {
          this.style.display = "none";
        }
      });
    }
  },
  {
    forPage() {
      return true;
    },
  },
);

// The header stays at the top of the window on most pages, and its height depends on
// what's in it. Content that sticks to the top of the window, like a storymap's map,
// goes below it.
let headerObserver;

onRender(
  () => {
    const header = document.getElementById("topHeaderComponent");

    headerObserver?.disconnect();

    if (!header) {
      return;
    }

    headerObserver = new ResizeObserver(() => {
      const height = getComputedStyle(header).position === "fixed" ? header.offsetHeight : 0;

      document.documentElement.style.setProperty("--pd-header-height", `${height}px`);
    });
    headerObserver.observe(header);
  },
  {
    forPage() {
      return true;
    },
  },
);
