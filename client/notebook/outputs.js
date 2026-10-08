/**
 * The outputs of a cell, as they come from Python, written into the page the way the
 * build writes the ones a Jupyter notebook was saved with: see lib/md-plugins/notebook.js.
 * They are kept in Jupyter's format too, for the notebook to be downloaded.
 */

// MIME types of an output, in the order they're preferred.
const OUTPUT_TYPES = ['text/html', 'image/svg+xml', 'image/png', 'image/jpeg', 'application/json', 'text/plain'];

const createElement = (tagName, className, textContent = '') => Object.assign(document.createElement(tagName), { className, textContent });

// eslint-disable-next-line no-control-regex
const stripColours = (text) => text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');

// Text with what came after it. A carriage return starts its line over, as a progress
// bar does.
export function addText(text, chunk) {
  return stripColours(text + chunk.replace(/\r\n/g, '\n'))
    .split('\n')
    .map((line, index, lines) => {
      // The last line may be followed by more of it, so its end is kept.
      const cut = index === lines.length - 1 ? line.slice(0, -1).lastIndexOf('\r') : line.lastIndexOf('\r');

      return cut === -1 ? line : line.slice(cut + 1);
    })
    .join('\n');
}

/**
 * The outputs of a cell in element. clear() empties them, and stream(), display() and
 * error() add the messages of a run. outputs holds them in Jupyter's format.
 */
export function createOutputs(element, count) {
  const outputs = [];
  let lastStream = null;

  function append(node) {
    element.append(node);
    lastStream = null;
  }

  return {
    outputs,

    clear() {
      element.replaceChildren();
      outputs.length = 0;
      lastStream = null;
    },

    stream({ name, text }) {
      // What a cell prints, in a row, goes in one block.
      if (lastStream?.output.name !== name) {
        const output = { output_type: 'stream', name, text: '' };
        const node = createElement('pre', `notebook-stream${name === 'stderr' ? ' is-stderr' : ''}`);

        append(node);
        outputs.push(output);
        lastStream = { output, node };
      }

      lastStream.output.text = addText(lastStream.output.text, text);
      lastStream.node.textContent = lastStream.output.text;
    },

    display({ data, isResult }) {
      const type = OUTPUT_TYPES.find((name) => typeof data[name] === 'string');
      let node;

      switch (type) {
        case 'text/html':
        case 'image/svg+xml':
          // The author's notebook shows what its code makes; scripts in it don't run.
          node = createElement('div', 'notebook-rich');
          node.innerHTML = data[type];

          // The empty corners of a pandas table are cells, not headers.
          for (const header of node.querySelectorAll('th:empty')) {
            header.replaceWith(document.createElement('td'));
          }

          // A wide table scrolls, by the keyboard too.
          node.tabIndex = 0;
          break;
        case 'image/png':
        case 'image/jpeg':
          node = Object.assign(document.createElement('img'), {
            className: 'notebook-image',
            src: `data:${type};base64,${data[type]}`,
            alt: data['text/plain'] || 'Output'
          });
          break;
        case 'application/json':
          node = createElement('pre', 'notebook-text-output', JSON.stringify(JSON.parse(data[type]), null, 2));
          break;
        default:
          node = createElement('pre', 'notebook-text-output', data['text/plain'] ?? '');
          break;
      }

      append(node);
      outputs.push(isResult
        ? { output_type: 'execute_result', execution_count: count(), data, metadata: {} }
        : { output_type: 'display_data', data, metadata: {} });
    },

    error({ ename, evalue, traceback }) {
      const node = createElement('pre', 'notebook-error');
      const lines = traceback?.length ? traceback : [`${ename}: ${evalue}`];

      node.textContent = stripColours(lines.join('\n'));
      append(node);
      outputs.push({ output_type: 'error', ename, evalue, traceback: lines });
    }
  };
}

// A short random id, which Jupyter gives every cell.
const cellId = () => Math.random().toString(36).slice(2, 10);

// A notebook in Jupyter's format: the setup, as a first cell, then the cells as they
// are now, with their outputs.
export function toJupyter({ title, setup, cells, python }) {
  const notebookCells = cells.map((cell) => (cell.type === 'markdown'
    ? { cell_type: 'markdown', id: cellId(), metadata: {}, source: cell.source }
    : {
      cell_type: 'code',
      id: cellId(),
      metadata: {},
      execution_count: cell.count,
      source: cell.source,
      outputs: cell.outputs
    }));

  if (setup) {
    notebookCells.unshift({ cell_type: 'code', id: cellId(), metadata: {}, execution_count: null, source: `# What ran before the cells in the browser\n${setup}`, outputs: [] });
  }

  if (title) {
    notebookCells.unshift({ cell_type: 'markdown', id: cellId(), metadata: {}, source: `# ${title}` });
  }

  return {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: { name: 'python3', display_name: 'Python 3', language: 'python' },
      language_info: { name: 'python', version: python ?? '3' }
    },
    cells: notebookCells
  };
}
