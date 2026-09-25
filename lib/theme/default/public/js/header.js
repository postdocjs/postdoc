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
