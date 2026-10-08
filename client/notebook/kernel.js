/**
 * A notebook's Python: Pyodide in a worker, which runs one cell at a time. See
 * worker.js for what goes to it and what comes back.
 *
 * A running cell can be interrupted when the page is isolated by the browser, as the
 * worker then shares a buffer with the page. Otherwise stopping a cell means starting
 * Python again.
 */

import { notebookWorker } from './worker.js';

// The version of Pyodide, which is the version of Python with a release after it.
const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/';
// How long the editor waits for completions, which wait for a running cell, in ms.
const COMPLETION_TIMEOUT = 1500;

let workerURL = null;

// A URL of the site, which may be served from a subfolder, as an absolute one: the
// worker comes from a blob and has no address of its own to resolve it against.
function absolute(url) {
  const path = url.startsWith('/') && !url.startsWith('//') ? (import.meta.env?.BASE_URL ?? '/') + url.slice(1) : url;

  return new URL(path, document.baseURI).href;
}

const isURL = (value) => /^(\/|\.\/|https?:)/.test(value);

/**
 * Starts Python with the settings of a notebook: packages, files and setup. onStatus is
 * given what it is doing, and onSetup what the setup prints.
 */
export function createKernel({ packages = [], files = {}, setup }, { onStatus, onSetup } = {}) {
  workerURL ??= URL.createObjectURL(new Blob([`(${notebookWorker})();`], { type: 'text/javascript' }));

  const worker = new Worker(workerURL, { type: 'module' });
  const interrupt = globalThis.crossOriginIsolated ? new SharedArrayBuffer(4) : null;
  const pending = new Map();
  let nextId = 0;
  let isStopped = false;
  let resolveReady;
  let rejectReady;
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  // A rejection nobody waits for isn't an error of the page.
  ready.catch(() => {});

  // Every run that hasn't ended ends now, without success.
  function endAll() {
    for (const { resolve } of pending.values()) {
      resolve(false);
    }

    pending.clear();
  }

  worker.addEventListener('message', ({ data }) => {
    switch (data.type) {
      case 'status':
        onStatus?.(data);
        break;
      case 'ready':
        resolveReady(data.python);
        break;
      case 'failed':
        rejectReady(new Error(data.message));
        break;
      case 'stream':
      case 'display':
      case 'error':
        if (data.id === 'setup') {
          onSetup?.(data);
        } else {
          pending.get(data.id)?.handlers[data.type]?.(data);
        }

        break;
      case 'done':
      case 'completions':
        pending.get(data.id)?.resolve(data.type === 'done' ? data.ok : data);
        pending.delete(data.id);
        break;
      default:
        break;
    }
  });

  worker.addEventListener('error', (event) => {
    event.preventDefault();
    rejectReady(new Error(event.message || 'Python stopped'));
    endAll();
  });

  worker.postMessage({
    type: 'boot',
    indexURL: PYODIDE,
    packages: packages.map((entry) => {
      if (typeof entry === 'string') {
        return isURL(entry) ? absolute(entry) : entry;
      }

      return entry.url ? { ...entry, url: absolute(entry.url) } : entry;
    }),
    files: Object.entries(files).map(([path, file]) => ({ path, url: file.url && absolute(file.url), content: file.content })),
    setup,
    interrupt
  });

  return {
    ready,

    canInterrupt: Boolean(interrupt),

    // Runs a cell's code. handlers get its stream, display and error messages. Resolves
    // to true when it ran without an error.
    run(code, count, handlers) {
      if (isStopped) {
        return Promise.resolve(false);
      }

      const id = ++nextId;

      return new Promise((resolve) => {
        pending.set(id, { resolve, handlers });

        if (interrupt) {
          new Int32Array(interrupt)[0] = 0;
        }

        worker.postMessage({ type: 'run', id, code, count });
      });
    },

    // The names that complete the word before the cursor: { prefix, items }.
    complete(code, cursor) {
      const id = ++nextId;
      const answer = new Promise((resolve) => {
        pending.set(id, { resolve });
        worker.postMessage({ type: 'complete', id, code, cursor });
      });
      const timeout = new Promise((resolve) => setTimeout(() => resolve({ prefix: '', items: [] }), COMPLETION_TIMEOUT));

      return Promise.race([answer, timeout]).then((result) => result || { prefix: '', items: [] });
    },

    // Raises KeyboardInterrupt in the running cell, when the page shares a buffer with it.
    interrupt() {
      if (interrupt) {
        new Int32Array(interrupt)[0] = 2;
      }
    },

    stop() {
      isStopped = true;
      worker.terminate();
      rejectReady(new Error('Python was stopped'));
      endAll();
    }
  };
}
