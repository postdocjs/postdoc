import Renderer from './renderer.js';
import Navigator from './navigator.js';

export default class Session {
  renderer = new Renderer(this);
  navigator = new Navigator(this);

  constructor() {
    this.#setupViteConnection();
  }

  #isReadinessScheduled = false;

  init() {
    this.renderer.init();

    // Every page runs init(), also after navigation without a reload, which signals
    // readiness itself. So only the first page load is handled here: by its load event,
    // the module scripts that register onRender callbacks have run.
    if (!this.#isReadinessScheduled) {
      this.#isReadinessScheduled = true;

      if (document.readyState === 'complete') {
        this.navigator.signalReady();
      } else {
        addEventListener('load', () => this.navigator.signalReady(), { once: true });
      }
    }
  }

  #setupViteConnection() {
    if (import.meta.hot) {
      import.meta.hot.on('postdoc:reload-page', () => this.navigator.reload());

      import('./overlay.js').then(() => {
        let overlay;

        import.meta.hot.on('vite:ws:disconnect', () => {
          // Close a previous one if it exists.
          overlay?.close();

          overlay =
            this.renderer.currentSnapshot.createElement('postdoc-overlay');

          overlay.shadowRoot.querySelector('.plugin').append('postdoc');
          overlay.shadowRoot
            .querySelector('.message-body')
            .append(' ', 'Server is stopped.');

          this.renderer.currentSnapshot.body.append(overlay);
        });

        import.meta.hot.on('vite:ws:connect', () => {
          overlay?.close();
        });
      });
    }
  }
}
