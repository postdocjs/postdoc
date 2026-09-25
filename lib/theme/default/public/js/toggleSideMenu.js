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
    // Open / close left side menu on mobile
    const toggleSidebarButton = document.getElementById("sideMenuButton");
    const sidebar = document.getElementById("left-sidebar");
    const closeSidebarButton = document.getElementById("closeLeftSidebarButton");

    if (toggleSidebarButton && sidebar) {
      toggleSidebarButton.addEventListener("click", function () {
        sidebar.classList.add("open");
      });

      document.addEventListener("click", function (event) {
        if (
          !sidebar.contains(event.target) &&
          !toggleSidebarButton.contains(event.target)
        ) {
          sidebar.classList.remove("open");
        }
      });

      if (closeSidebarButton) {
        closeSidebarButton.addEventListener("click", function () {
          sidebar.classList.remove("open");
        });
      }
    }

    // Open / close right side menu on mobile
    const toggleRightSidebarButton = document.getElementById("modalButton");
    const rightSidebar = document.querySelector(".right-sidebar-container");
    const closeModalButton = document.querySelector(".right-sidebar-close-button");

    if (toggleRightSidebarButton && rightSidebar) {
      toggleRightSidebarButton.addEventListener("click", function () {
        rightSidebar.classList.add("open");
      });

      document.addEventListener("click", function (event) {
        if (
          !rightSidebar.contains(event.target) &&
          !toggleRightSidebarButton.contains(event.target)
        ) {
          rightSidebar.classList.remove("open");
        }
      });

      if (closeModalButton) {
        closeModalButton.addEventListener("click", function () {
          rightSidebar.classList.remove("open");
        });
      }
    }
  },
  {
    forPage: /guide|api_reference|getting-started|about/,
  },
);
