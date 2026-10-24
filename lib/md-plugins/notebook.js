/**
 * Notebooks: Python cells that run in the reader's browser, with
 * [Pyodide](https://pyodide.org), on the page itself. The cells are the `python` code
 * blocks in the container, and the text between them is shown between the cells:
 *
 * ````md
 * ::: notebook
 * ```yaml
 * title: A first look
 * packages: [pandas, matplotlib]
 * files:
 *   data/track.csv: { url: /data/track.csv }
 * ```
 *
 * Read the track:
 *
 * ```python
 * import pandas as pd
 * track = pd.read_csv('data/track.csv', parse_dates=['time'])
 * track.head()
 * ```
 * :::
 * ````
 *
 * The settings, in a YAML or JSON code block at the start of the container:
 *
 * - `title` - the name of the notebook. "Python notebook" by default.
 * - `src` - the URL of a Jupyter notebook, an `.ipynb` file in the site's public
 *   files, to take the cells from, with the outputs it was saved with. The text of the
 *   container is shown above it then.
 * - `packages` - what to install before the cells run: names of packages that Pyodide
 *   has or that PyPI has as pure Python wheels, URLs of wheels, or `{ name, deps: false }`
 *   to install a package without the packages it depends on. The packages that the
 *   cells import and Pyodide has are installed anyway.
 * - `files` - the files to put in the working directory, as in a playground: a folder of
 *   the site's public files by its URL, or a map from each path to `{ url }` or
 *   `{ content }`.
 * - `setup` - Python code to run before the first cell, such as settings or patches the
 *   cells need in a browser. It is shown, folded, above the cells.
 *
 * The cells are written into the page when it is built, so they are read, searched and
 * checked like the rest of it, and the reader runs them with nothing to install. The
 * client in client/notebook runs them.
 */

import { existsSync, readFileSync } from 'node:fs';

import { loadYaml } from '../utils/yaml.js';
import { codeToHtml, createCssVariablesTheme } from 'shiki';

import { readFiles, resolvePublicPath } from './public-files.js';

const SETTINGS = ['title', 'src', 'packages', 'files', 'setup'];
const CODE_LANGUAGES = ['python', 'py', 'python3'];
// MIME types of an output, in the order they're preferred.
const OUTPUT_TYPES = ['text/html', 'image/svg+xml', 'image/png', 'image/jpeg', 'text/plain'];

// The colours of a cell's code come from CSS custom properties, which the notebook
// panel sets from the same colours as the editor's.
const codeTheme = createCssVariablesTheme({ name: 'postdoc-notebook', variablePrefix: '--shiki-', fontStyle: true });

function fail(message) {
  throw new Error(`Notebook: ${message}`);
}

const escapeHTML = (text) => String(text)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

// Jupyter writes a cell's source and an output's text as a string or a list of lines.
const joinLines = (value) => (Array.isArray(value) ? value.join('') : value ?? '');

// The colours that a traceback carries, as escape codes, are left out of a page.
// eslint-disable-next-line no-control-regex
const stripColours = (text) => text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');

function parsePackages(packages) {
  if (!Array.isArray(packages)) {
    fail('packages should be a list of package names or wheel URLs.');
  }

  return packages.map((entry) => {
    if (typeof entry === 'string' && entry.trim()) {
      return entry.trim();
    }

    if (typeof entry === 'object' && entry !== null && !Array.isArray(entry) &&
      (typeof entry.name === 'string') !== (typeof entry.url === 'string') &&
      Object.keys(entry).every((key) => ['name', 'url', 'deps'].includes(key)) &&
      (entry.deps === undefined || typeof entry.deps === 'boolean')) {
      return entry;
    }

    fail(`${JSON.stringify(entry)} isn't a package. Use a name, a URL, or { name, deps: false }.`);
  });
}

function parseSettings(source, publicDirectory) {
  const match = /^\s*```(?:ya?ml|json)[ \t]*\n([\s\S]*?)\n```[ \t]*(?:\n|$)/.exec(source);
  let settings = {};

  if (match) {
    try {
      settings = loadYaml(match[1]) ?? {};
    } catch (error) {
      fail(`the settings aren't valid YAML: ${error.message}`);
    }
  }

  if (typeof settings !== 'object' || settings === null || Array.isArray(settings)) {
    fail('the settings should be a set of keys, such as title and packages.');
  }

  for (const name of Object.keys(settings)) {
    if (!SETTINGS.includes(name)) {
      fail(`${name} isn't a setting. Use ${SETTINGS.join(', ').replace(/, (\w+)$/, ' or $1')}.`);
    }
  }

  const { title, src, packages = [], files = {}, setup } = settings;

  for (const [name, value] of Object.entries({ title, src, setup })) {
    if (value !== undefined && (typeof value !== 'string' || !value.trim())) {
      fail(`${name} should be text.`);
    }
  }

  return {
    settings: {
      ...settings,
      packages: parsePackages(packages),
      files: readFiles(files, publicDirectory, fail)
    },
    rest: match ? source.slice(match[0].length) : source
  };
}

// The cells of a Jupyter notebook in the site's public files.
function readNotebook(src, publicDirectory) {
  const path = resolvePublicPath(src, publicDirectory);

  if (!path || !existsSync(path)) {
    fail(`src: ${src} isn't a notebook in the site's public files.`);
  }

  let notebook;

  try {
    notebook = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`src: ${src} isn't a Jupyter notebook: ${error.message}`);
  }

  if (!Array.isArray(notebook?.cells)) {
    fail(`src: ${src} has no cells.`);
  }

  return notebook.cells
    .filter((cell) => cell.cell_type === 'code' || cell.cell_type === 'markdown')
    .map((cell) => ({
      type: cell.cell_type,
      source: joinLines(cell.source),
      outputs: cell.outputs ?? [],
      count: cell.execution_count ?? null
    }));
}

// The cells written in the container: each python code block is one, and the text
// between them makes the others.
function splitCells(tokens) {
  const cells = [];
  let text = [];

  const flush = () => {
    if (text.some((token) => token.type !== 'space')) {
      cells.push({ type: 'markdown', source: text.map((token) => token.raw).join('').trim(), tokens: text });
    }

    text = [];
  };

  for (const token of tokens) {
    if (token.type === 'code' && CODE_LANGUAGES.includes((token.lang ?? '').split(/\s/)[0])) {
      flush();
      cells.push({ type: 'code', source: token.text, outputs: [], count: null });
    } else {
      text.push(token);
    }
  }

  flush();

  return cells;
}

// An output that Jupyter saved, as it is shown on the page.
export function renderOutput(output) {
  switch (output.output_type) {
    case 'stream':
      return `<pre class="notebook-stream${output.name === 'stderr' ? ' is-stderr' : ''}">${escapeHTML(joinLines(output.text))}</pre>`;
    case 'error':
      return `<pre class="notebook-error">${escapeHTML(stripColours(joinLines(output.traceback).length ? [].concat(output.traceback).join('\n') : `${output.ename}: ${output.evalue}`))}</pre>`;
    case 'display_data':
    case 'execute_result': {
      const data = output.data ?? {};
      const type = OUTPUT_TYPES.find((name) => data[name] !== undefined);
      const value = joinLines(data[type]);
      const alt = escapeHTML(joinLines(data['text/plain']) || 'Output');

      switch (type) {
        case 'text/html':
        case 'image/svg+xml':
          // The empty corners of a pandas table are cells, not headers.
          return `<div class="notebook-rich" tabindex="0">${value.replace(/<th><\/th>/g, '<td></td>')}</div>`;
        case 'image/png':
        case 'image/jpeg':
          return `<img class="notebook-image" src="data:${type};base64,${value.replace(/\s/g, '')}" alt="${alt}">`;
        case 'text/plain':
          return `<pre class="notebook-text-output">${escapeHTML(value)}</pre>`;
        default:
          return '';
      }
    }
    default:
      return '';
  }
}

async function highlight(code, isHighlighted) {
  if (!isHighlighted) {
    return `<pre class="notebook-source" tabindex="0"><code>${escapeHTML(code)}</code></pre>`;
  }

  const html = await codeToHtml(code, { lang: 'python', theme: codeTheme });

  // The class shiki gives the block would take the site's code colours instead.
  return html.replace(/^<pre class="shiki[^"]*" style="[^"]*"/, '<pre class="notebook-source"');
}

// The extension, for a site whose public files are in publicDirectory. With
// isHighlighted false, the code of the cells isn't coloured.
export const notebookExtension = (publicDirectory, isHighlighted = true) => ({
  extensions: [{
    name: 'notebook',
    level: 'block',
    start(src) {
      return src.match(/^:{3,} notebook/m)?.index;
    },

    tokenizer(src) {
      const match = /^(:{3,}) notebook[ \t]*\n([\s\S]*?)\n\1(?!:)[ \t]*(?:\n|$)/.exec(src);

      if (!match) {
        return;
      }

      const { settings, rest } = parseSettings(match[2], publicDirectory);
      let cells;
      let tokens = [];

      if (settings.src) {
        cells = readNotebook(settings.src, publicDirectory);
        tokens = this.lexer.blockTokens(rest, []);

        for (const cell of cells) {
          if (cell.type === 'markdown') {
            cell.tokens = this.lexer.blockTokens(cell.source, []);
          }
        }
      } else {
        cells = splitCells(this.lexer.blockTokens(rest, []));
      }

      return {
        type: 'notebook',
        raw: match[0],
        settings,
        cells,
        tokens,
        // The Markdown of the text and of the cells, which the other extensions see too,
        // so that code blocks in it are coloured. The code cells are coloured here.
        children: [...tokens, ...cells.filter((cell) => cell.type === 'markdown').flatMap((cell) => cell.tokens)]
      };
    },

    childTokens: ['children'],

    renderer(token) {
      const { settings, cells } = token;
      const configuration = {
        title: settings.title,
        packages: settings.packages,
        files: settings.files,
        setup: settings.setup,
        cells: cells.map(({ type, source }) => ({ type, source }))
      };
      // In a script element, "</script>" in a value would end it early.
      const json = JSON.stringify(configuration).replace(/</g, '\\u003c');
      const installs = settings.packages.map((entry) => (typeof entry === 'string' ? entry : entry.name ?? entry.url));
      const paths = Object.keys(settings.files);
      let html = `<div class="notebook"><script type="application/json" class="notebook-configuration">${json}</script>`;

      if (token.tokens.length) {
        html += `<div class="notebook-text">${this.parser.parse(token.tokens)}</div>`;
      }

      // What runs before the cells is there to read too, folded away.
      if (installs.length || paths.length || settings.setup) {
        html += '<details class="notebook-setup"><summary>What runs before the cells</summary>';
        html += installs.length ? `<p>Installs ${installs.map((name) => `<code>${escapeHTML(name)}</code>`).join(', ')}.</p>` : '';
        html += paths.length ? `<p>Puts ${paths.map((path) => `<code>${escapeHTML(path)}</code>`).join(', ')} in the working directory.</p>` : '';
        html += settings.setup ? token.setupHTML : '';
        html += '</details>';
      }

      html += '<div class="notebook-cells">';

      cells.forEach((cell, index) => {
        if (cell.type === 'markdown') {
          html += `<div class="notebook-cell notebook-markdown" data-cell="${index}">${this.parser.parse(cell.tokens)}</div>`;
        } else {
          const count = cell.count === null ? '' : ` data-count="${cell.count}"`;

          html += `<div class="notebook-cell notebook-code" data-cell="${index}"${count}>` +
            `<div class="notebook-input">${cell.html}</div>` +
            `<div class="notebook-outputs">${cell.outputs.map(renderOutput).join('')}</div></div>`;
        }
      });

      return `${html}</div></div>\n`;
    }
  }],

  // Colouring the code takes shiki, which is asynchronous.
  async walkTokens(token) {
    if (token.type !== 'notebook') {
      return;
    }

    await Promise.all(token.cells.filter((cell) => cell.type === 'code').map(async (cell) => {
      cell.html = await highlight(cell.source, isHighlighted);
    }));

    if (token.settings.setup) {
      token.setupHTML = await highlight(token.settings.setup, isHighlighted);
    }
  },

  async: true
});
