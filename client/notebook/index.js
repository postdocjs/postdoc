/**
 * Runs the notebooks of a page: Python cells, in the reader's browser, with Pyodide.
 * The Markdown extension in lib/md-plugins/notebook.js writes the cells into the page,
 * where they are read like the rest of it, and PostDoc loads this module on the pages
 * that have a notebook.
 *
 * Nothing heavy is loaded until the reader runs a cell. Then the cells become editors,
 * Monaco as in the playground, while Python starts in a worker, with the packages and
 * the files of the settings, and the cells run one after the other.
 *
 * The keys are Jupyter's and VS Code's: Shift+Enter runs a cell and goes to the next,
 * Ctrl+Enter (Cmd on a Mac) runs it, and Alt+Enter runs it and adds one below.
 */

import '../playground/tokens.css';
import './notebook.css';
import { onLeave, onRender } from '../page/index.js';
import { icon, iconButton, loadIcons, setIcon } from '../playground/icons.js';
import { loadMonaco } from '../playground/monaco.js';
import { monacoTheme, readTheme } from '../playground/theme.js';
import { createKernel } from './kernel.js';
import { createOutputs, toJupyter } from './outputs.js';

const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = IS_MAC ? '⌘' : 'Ctrl+';
// The icon of a code cell's button, by what the cell is doing.
const CELL_ICONS = { idle: 'play', queued: 'clock', running: 'loading codicon-modifier-spin' };

const notebooks = new Set();
// The notebook that each cell editor belongs to, by the address of its model.
const notebooksByModel = new Map();
let completions = null;
let notebookCount = 0;

const createElement = (tagName, className, textContent = '') => Object.assign(document.createElement(tagName), { className, textContent });

// The toolbar stays in view below what the page keeps at the top of the window, such
// as a fixed header, whose height depends on the theme and the width of the window.
function placeToolbar(notebook) {
  const { left, width } = notebook.element.getBoundingClientRect();
  let top = 0;

  for (const node of document.elementsFromPoint(left + width / 2, 1)) {
    if (notebook.element.contains(node)) {
      continue;
    }

    const { position } = getComputedStyle(node);
    const { bottom, height } = node.getBoundingClientRect();

    // A sidebar that runs down the window isn't a header.
    if ((position === 'fixed' || position === 'sticky') && height < innerHeight * 0.4) {
      top = Math.max(top, bottom);
    }
  }

  notebook.element.style.setProperty('--notebook-top', `${Math.round(top)}px`);
}

function placeToolbars() {
  for (const notebook of notebooks) {
    placeToolbar(notebook);
  }
}

function setStatus(notebook, message, isError = false) {
  notebook.status.textContent = message;
  notebook.status.classList.toggle('is-error', isError);
}

// What a code cell shows: its button, its count and its state.
function showCellState(cell, state) {
  cell.state = state;
  cell.element.classList.toggle('is-running', state === 'running');
  cell.element.classList.toggle('is-queued', state === 'queued');
  setIcon(cell.button, CELL_ICONS[state]);
  cell.button.title = { idle: `Run the cell (${MOD}Enter)`, queued: 'Don\'t run the cell', running: 'Stop' }[state];
  cell.button.setAttribute('aria-label', `${{ idle: 'Run', queued: 'Don\'t run', running: 'Stop' }[state]} cell ${cell.number}`);
  cell.countLabel.textContent = state === 'idle' ? (cell.count === null ? '[ ]' : `[${cell.count}]`) : '[*]';
}

function createCodeCell(notebook, element, source, index) {
  const number = notebook.cells.filter((cell) => cell.type === 'code').length + 1;
  const gutter = createElement('div', 'notebook-gutter');
  const button = iconButton('play', `Run cell ${number}`, 'notebook-run-cell');
  const countLabel = createElement('span', 'notebook-count');
  const outputsElement = element.querySelector('.notebook-outputs');
  const cell = {
    type: 'code',
    index,
    number,
    element,
    source,
    button,
    countLabel,
    count: element.dataset.count ? Number(element.dataset.count) : null,
    state: 'idle',
    editor: null,
    model: null,
    hasRun: false
  };

  cell.outputs = createOutputs(outputsElement, () => cell.count);
  countLabel.setAttribute('aria-hidden', 'true');
  gutter.append(button, countLabel);
  element.prepend(gutter);
  button.addEventListener('click', () => {
    if (cell.state === 'idle') {
      run(notebook, [cell]);
    } else if (cell.state === 'queued') {
      notebook.queue.splice(notebook.queue.indexOf(cell), 1);
      showCellState(cell, 'idle');
    } else {
      stop(notebook);
    }
  });
  showCellState(cell, 'idle');

  return cell;
}

function createNotebook(element) {
  const configuration = JSON.parse(element.querySelector('.notebook-configuration')?.textContent || 'null');
  const cellsElement = element.querySelector('.notebook-cells');

  if (!configuration || !cellsElement) {
    return;
  }

  loadIcons();

  const toolbar = createElement('div', 'notebook-toolbar');
  const title = createElement('span', 'notebook-title', configuration.title ?? 'Python notebook');
  const status = createElement('span', 'notebook-status', 'Runs in your browser');
  const runAll = createElement('button', 'notebook-run-all');
  const stopButton = iconButton('debug-stop', 'Stop');
  const restart = iconButton('debug-restart', 'Restart Python');
  const download = iconButton('desktop-download', 'Download as a Jupyter notebook');
  const addButton = createElement('button', 'notebook-add');
  const notebook = {
    id: ++notebookCount,
    element,
    configuration,
    status,
    stopButton,
    restart,
    addButton,
    cells: [],
    queue: [],
    running: null,
    kernel: null,
    isReady: false,
    python: null,
    counter: 0,
    monaco: null,
    editors: null,
    setupOutputs: null
  };

  runAll.type = 'button';
  runAll.append(icon('run-all'), createElement('span', '', 'Run all'));
  addButton.type = 'button';
  addButton.hidden = true;
  addButton.append(icon('add'), createElement('span', '', 'Code'));
  addButton.setAttribute('aria-label', 'Add a code cell');
  stopButton.disabled = true;
  restart.disabled = true;
  status.setAttribute('aria-live', 'polite');
  toolbar.append(title, status, runAll, stopButton, restart, download);
  element.insertBefore(toolbar, element.querySelector('.notebook-setup') ?? cellsElement);
  cellsElement.after(addButton);

  // The setup's own output, if it prints, goes under it.
  const setupElement = element.querySelector('.notebook-setup');

  if (setupElement) {
    const outputsElement = createElement('div', 'notebook-outputs');

    setupElement.append(outputsElement);
    notebook.setupOutputs = createOutputs(outputsElement, () => null);
  }

  configuration.cells.forEach((cell, index) => {
    const cellElement = cellsElement.querySelector(`.notebook-cell[data-cell="${index}"]`);

    notebook.cells.push(cell.type === 'code'
      ? createCodeCell(notebook, cellElement, cell.source, index)
      : { type: 'markdown', index, element: cellElement, source: cell.source });
  });

  runAll.addEventListener('click', () => run(notebook, notebook.cells.filter((cell) => cell.type === 'code')));
  stopButton.addEventListener('click', () => stop(notebook));
  restart.addEventListener('click', () => restartPython(notebook));
  download.addEventListener('click', () => downloadNotebook(notebook));
  addButton.addEventListener('click', () => addCell(notebook));

  notebooks.add(notebook);
  placeToolbar(notebook);
}

// Starts Python with the settings of the notebook.
function startPython(notebook) {
  const { configuration } = notebook;

  notebook.isReady = false;
  notebook.counter = 0;
  notebook.restart.disabled = false;
  setStatus(notebook, 'Loading Python…');
  notebook.setupOutputs?.clear();
  notebook.kernel = createKernel(configuration, {
    onStatus({ state, message }) {
      if (message && state !== 'idle' && state !== 'busy') {
        setStatus(notebook, `${message}…`);
      }
    },
    onSetup(message) {
      notebook.setupOutputs?.[message.type](message);
      notebook.element.querySelector('.notebook-setup')?.setAttribute('open', '');
    }
  });

  const kernel = notebook.kernel;

  kernel.ready.then((python) => {
    if (notebook.kernel !== kernel) {
      return;
    }

    notebook.isReady = true;
    notebook.python = python;
    setStatus(notebook, `Python ${python}`);
    pump(notebook);
  }, (error) => {
    if (notebook.kernel !== kernel) {
      return;
    }

    setStatus(notebook, `Python couldn't start: ${error.message}`, true);

    for (const cell of notebook.queue) {
      showCellState(cell, 'idle');
    }

    notebook.queue = [];
  });
}

// The editors, which take the place of the code as soon as Monaco has loaded.
async function startEditors(notebook) {
  notebook.editors ??= (async () => {
    const monaco = await loadMonaco();

    notebook.monaco = monaco;
    monaco.editor.defineTheme('postdoc', monacoTheme(readTheme(notebook.element)));
    registerCompletions(monaco);

    for (const cell of notebook.cells) {
      if (cell.type === 'code') {
        createEditor(notebook, cell);
      }
    }

    notebook.addButton.hidden = false;
  })();

  return notebook.editors;
}

function createEditor(notebook, cell) {
  const { monaco } = notebook;
  const input = cell.element.querySelector('.notebook-input');
  const host = createElement('div', 'notebook-editor');
  const uri = monaco.Uri.parse(`inmemory://notebook-${notebook.id}/cell-${cell.index}.py`);
  const model = monaco.editor.createModel(cell.source, 'python', uri);
  const editor = monaco.editor.create(host, {
    model,
    theme: 'postdoc',
    ariaLabel: `Code of cell ${cell.number}`,
    automaticLayout: true,
    fontFamily: getComputedStyle(notebook.element).getPropertyValue('--pg-code-font').trim(),
    fontSize: 13,
    lineHeight: 20,
    padding: { top: 10, bottom: 10 },
    lineNumbers: 'off',
    glyphMargin: false,
    folding: false,
    lineDecorationsWidth: 12,
    minimap: { enabled: false },
    overviewRulerLanes: 0,
    hideCursorInOverviewRuler: true,
    renderLineHighlight: 'none',
    scrollBeyondLastLine: false,
    // The page scrolls past a cell; only a long line scrolls in it.
    scrollbar: { vertical: 'hidden', alwaysConsumeMouseWheel: false, horizontalScrollbarSize: 8 },
    tabSize: 4,
    fixedOverflowWidgets: true
  });

  // A cell is as tall as its code.
  const fit = () => {
    host.style.height = `${editor.getContentHeight()}px`;
    editor.layout();
  };

  editor.onDidContentSizeChange(fit);
  fit();

  editor.addAction({
    id: 'postdoc.notebook.run',
    label: 'Run the cell',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
    run: () => run(notebook, [cell])
  });
  editor.addAction({
    id: 'postdoc.notebook.runNext',
    label: 'Run the cell and go to the next',
    keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.Enter],
    run() {
      run(notebook, [cell]);

      const next = notebook.cells.find((other) => other.type === 'code' && other.index > cell.index);

      if (next) {
        next.editor?.focus();
      } else {
        addCell(notebook);
      }
    }
  });
  editor.addAction({
    id: 'postdoc.notebook.runInsert',
    label: 'Run the cell and add one below',
    keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.Enter],
    run() {
      run(notebook, [cell]);
      addCell(notebook, cell);
    }
  });

  input.replaceChildren(host);
  cell.editor = editor;
  cell.model = model;
  notebooksByModel.set(uri.toString(), notebook);
}

// Completions come from Python, from the names that the cells have made so far.
function registerCompletions(monaco) {
  completions ??= monaco.languages.registerCompletionItemProvider('python', {
    triggerCharacters: ['.'],
    async provideCompletionItems(model, position) {
      const notebook = notebooksByModel.get(model.uri.toString());

      if (!notebook?.isReady) {
        return { suggestions: [] };
      }

      const { prefix, items } = await notebook.kernel.complete(model.getValue(), model.getOffsetAt(position));
      const word = prefix.slice(prefix.lastIndexOf('.') + 1);
      const range = new monaco.Range(position.lineNumber, position.column - word.length, position.lineNumber, position.column);

      return {
        suggestions: [...new Set(items)].map((item) => {
          const isCall = item.endsWith('(');
          const name = (isCall ? item.slice(0, -1) : item).split('.').pop();

          return {
            label: name,
            insertText: name,
            kind: isCall ? monaco.languages.CompletionItemKind.Function : monaco.languages.CompletionItemKind.Variable,
            range
          };
        })
      };
    }
  });
}

// Runs cells, after the ones already waiting. Python and the editors start with the
// first run.
function run(notebook, cells) {
  for (const cell of cells) {
    if (cell.state === 'idle') {
      showCellState(cell, 'queued');
      notebook.queue.push(cell);
    }
  }

  startEditors(notebook).catch((error) => setStatus(notebook, error.message, true));

  if (!notebook.kernel) {
    startPython(notebook);
  }

  notebook.stopButton.disabled = false;
  pump(notebook);
}

async function pump(notebook) {
  if (notebook.running || !notebook.isReady) {
    return;
  }

  const cell = notebook.queue.shift();

  if (!cell) {
    notebook.stopButton.disabled = true;

    return;
  }

  const { kernel } = notebook;
  const count = ++notebook.counter;

  notebook.running = cell;
  cell.outputs.clear();
  cell.count = count;
  showCellState(cell, 'running');
  setStatus(notebook, `Running cell ${cell.number}…`);

  const ok = await kernel.run(cell.model?.getValue() ?? cell.source, count, {
    stream: (message) => cell.outputs.stream(message),
    display: (message) => cell.outputs.display(message),
    error: (message) => cell.outputs.error(message)
  });

  // Python may have been started again meanwhile; the new one runs what's next.
  if (notebook.kernel !== kernel) {
    return;
  }

  notebook.running = null;
  notebook.isStopping = false;
  cell.hasRun = true;
  cell.element.classList.toggle('has-failed', !ok);
  showCellState(cell, 'idle');

  if (ok) {
    setStatus(notebook, `Python ${notebook.python} · cell ${cell.number} ran`);
  } else {
    // The cells after one that failed would fail too: Jupyter stops there as well.
    setStatus(notebook, notebook.isStopping ? `Cell ${cell.number} was stopped` : `Cell ${cell.number} stopped with an error`, !notebook.isStopping);

    for (const waiting of notebook.queue) {
      showCellState(waiting, 'idle');
    }

    notebook.queue = [];
  }

  pump(notebook);
}

// Stops the running cell, and the ones waiting. Without a buffer shared with Python,
// that takes starting it again.
function stop(notebook) {
  for (const cell of notebook.queue) {
    showCellState(cell, 'idle');
  }

  notebook.queue = [];

  const cell = notebook.running;

  if (!cell) {
    notebook.stopButton.disabled = true;
  } else if (notebook.kernel.canInterrupt) {
    notebook.isStopping = true;
    notebook.kernel.interrupt();
  } else {
    restartPython(notebook);
    cell.outputs.error({ ename: 'Stopped', evalue: 'Python was started again to stop the cell, so what the cells made before is gone.', traceback: [] });
  }
}

function restartPython(notebook) {
  const cell = notebook.running;

  notebook.kernel?.stop();
  notebook.running = null;

  if (cell) {
    showCellState(cell, 'idle');
  }

  for (const waiting of notebook.queue) {
    showCellState(waiting, 'idle');
  }

  notebook.queue = [];
  notebook.stopButton.disabled = true;
  startPython(notebook);
}

// A new, empty code cell at the end, or after a cell.
async function addCell(notebook, after = null) {
  await startEditors(notebook);

  const cellsElement = notebook.element.querySelector('.notebook-cells');
  const index = Math.max(...notebook.cells.map((cell) => cell.index)) + 1;
  const element = createElement('div', 'notebook-cell notebook-code is-added');

  element.dataset.cell = String(index);
  element.append(createElement('div', 'notebook-input'), createElement('div', 'notebook-outputs'));

  const position = after ? notebook.cells.indexOf(after) + 1 : notebook.cells.length;

  if (after) {
    after.element.after(element);
  } else {
    cellsElement.append(element);
  }

  const cell = createCodeCell(notebook, element, '', index);
  const remove = iconButton('trash', 'Delete the cell', 'notebook-delete-cell');

  remove.addEventListener('click', () => {
    notebook.cells.splice(notebook.cells.indexOf(cell), 1);
    notebooksByModel.delete(cell.model.uri.toString());
    cell.editor.dispose();
    cell.model.dispose();
    element.remove();
  });
  cell.element.querySelector('.notebook-gutter').append(remove);
  notebook.cells.splice(position, 0, cell);
  createEditor(notebook, cell);
  cell.editor.focus();
}

function downloadNotebook(notebook) {
  const { configuration } = notebook;
  const cells = notebook.cells.map((cell) => (cell.type === 'markdown'
    ? { type: 'markdown', source: cell.source }
    : { type: 'code', source: cell.model?.getValue() ?? cell.source, count: cell.hasRun ? cell.count : null, outputs: cell.hasRun ? cell.outputs.outputs : [] }));
  const json = JSON.stringify(toJupyter({ title: configuration.title, setup: configuration.setup, cells, python: notebook.python }), null, 1);
  const name = (configuration.title ?? 'notebook').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'notebook';
  const link = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([json], { type: 'application/x-ipynb+json' })),
    download: `${name}.ipynb`
  });

  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function removeNotebooks() {
  for (const notebook of notebooks) {
    notebook.kernel?.stop();

    for (const cell of notebook.cells) {
      if (cell.model) {
        notebooksByModel.delete(cell.model.uri.toString());
        cell.editor.dispose();
        cell.model.dispose();
      }
    }
  }

  notebooks.clear();
}

onRender(() => document.querySelectorAll('.notebook').forEach(createNotebook), {
  forPage() {
    return true;
  }
});

addEventListener('resize', placeToolbars);

onLeave(removeNotebooks, {
  forPage() {
    return true;
  }
});
