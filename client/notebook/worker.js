/**
 * The Python of a notebook, in a worker of its own, so that a long cell doesn't stop
 * the page. kernel.js starts it from the source of notebookWorker, which is why the
 * function uses nothing from outside itself.
 *
 * It takes messages one at a time:
 *
 * - `boot`, with `indexURL`, `packages`, `files`, `setup` and an `interrupt` buffer:
 *   loads Pyodide, installs the packages, writes the files and runs the setup. It
 *   answers `ready`, with the version of Python, or `failed`.
 * - `run`, with `id`, `code` and `count`: runs a cell. What the cell prints comes back
 *   as `stream`, what it shows as `display`, a failure as `error`, and the end as `done`.
 * - `complete`, with `id`, `code` and `cursor`: answers `completions`, the names that
 *   complete the word before the cursor.
 *
 * `status` messages say what it is doing, such as the packages it loads.
 */

export function notebookWorker() {
  const HOME = '/home/pyodide';
  // Pyodide is an ES module. A worker made from a blob can import it, where a page that
  // the browser isolates won't let it use importScripts. The import is made from text, as
  // a bundler would otherwise change it, with names that don't exist in the worker.
  const importModule = new Function('url', 'return import(url)');

  // Shows values the way Jupyter does, sends figures, and reports failures without the
  // frames of the notebook itself. The names start with _postdoc, as they share the
  // namespace of the cells.
  const PRELUDE = `
import base64, builtins, importlib.abc, importlib.machinery, io, json, linecache, re, sys, traceback, types, warnings
from pyodide.code import eval_code_async
import _postdoc_kernel

_POSTDOC_METHODS = (
    ('text/html', '_repr_html_'),
    ('text/markdown', '_repr_markdown_'),
    ('image/svg+xml', '_repr_svg_'),
    ('image/png', '_repr_png_'),
    ('image/jpeg', '_repr_jpeg_'),
    ('text/latex', '_repr_latex_'),
    ('application/json', '_repr_json_'),
)


def _postdoc_from_matplotlib(value):
    return (type(value).__module__ or '').startswith('matplotlib.')


def _postdoc_is_figure(value):
    return (type(value).__module__ or '').startswith('matplotlib.figure')


# What a plotting call returns, such as the axes or a list of lines: Jupyter prints it
# above the figure, which says nothing a reader needs.
def _postdoc_is_artist(value):
    if isinstance(value, (list, tuple)) and value:
        return all(_postdoc_from_matplotlib(item) for item in value)
    return _postdoc_from_matplotlib(value) and not _postdoc_is_figure(value)


# A figure as a PNG, with a text alternative made of its titles and the labels of its axes.
def _postdoc_figure(figure):
    buffer = io.BytesIO()
    # Matplotlib warns about its own drawing code; the warning would be the notebook's.
    with warnings.catch_warnings():
        warnings.simplefilter('ignore', DeprecationWarning)
        figure.savefig(buffer, format='png', bbox_inches='tight', dpi=144)
    parts = []
    try:
        title = figure.get_suptitle()
    except Exception:
        title = ''
    if title:
        parts.append(title)
    for axes in figure.axes:
        bits = []
        if axes.get_title():
            bits.append(axes.get_title())
        if axes.get_xlabel():
            bits.append('x: ' + axes.get_xlabel())
        if axes.get_ylabel():
            bits.append('y: ' + axes.get_ylabel())
        if bits:
            parts.append(', '.join(bits))
    return {
        'image/png': base64.b64encode(buffer.getvalue()).decode('ascii'),
        'text/plain': ('Figure: ' + '; '.join(parts)) if parts else 'Figure',
    }


def _postdoc_format(value):
    if _postdoc_is_figure(value):
        return _postdoc_figure(value)
    data = {}
    bundle = getattr(value, '_repr_mimebundle_', None)
    if callable(bundle) and not isinstance(value, type):
        try:
            result = bundle()
            if isinstance(result, tuple):
                result = result[0]
            if isinstance(result, dict):
                data.update(result)
        except Exception:
            pass
    for mime, method in _POSTDOC_METHODS:
        function = getattr(value, method, None)
        if mime in data or not callable(function) or isinstance(value, type):
            continue
        try:
            result = function()
        except Exception:
            continue
        if isinstance(result, tuple):
            result = result[0]
        if result is None:
            continue
        if isinstance(result, bytes):
            result = base64.b64encode(result).decode('ascii')
        data[mime] = result
    try:
        data['text/plain'] = repr(value)
    except Exception:
        data['text/plain'] = '<' + type(value).__name__ + '>'
    return {mime: item if isinstance(item, str) else json.dumps(item) for mime, item in data.items()}


def _postdoc_send(value, is_result):
    _postdoc_kernel.display(json.dumps(_postdoc_format(value)), is_result)


def display(*values, **options):
    for value in values:
        _postdoc_send(value, False)


builtins.display = display


# Enough of IPython.display for the notebooks written for Jupyter, for a cell that
# imports it. Libraries that look for IPython, such as matplotlib, find none otherwise.
class _PostdocHTML:
    def __init__(self, data):
        self.data = data

    def _repr_html_(self):
        return self.data


class _PostdocMarkdown:
    def __init__(self, data):
        self.data = data

    def _repr_markdown_(self):
        return self.data


_postdoc_ipython = types.ModuleType('IPython')
# There's no IPython shell, which is what the libraries that ask are told.
_postdoc_ipython.get_ipython = lambda: None
_postdoc_ipython.version_info = (9, 0, 0)
_postdoc_display = types.ModuleType('IPython.display')
_postdoc_display.display = display
_postdoc_display.HTML = _PostdocHTML
_postdoc_display.Markdown = _PostdocMarkdown
_postdoc_ipython.display = _postdoc_display


class _PostdocIPythonFinder(importlib.abc.MetaPathFinder, importlib.abc.Loader):
    def find_spec(self, name, path=None, target=None):
        if name not in ('IPython', 'IPython.display'):
            return None
        return importlib.machinery.ModuleSpec(name, self, is_package=name == 'IPython')

    def create_module(self, spec):
        return _postdoc_ipython if spec.name == 'IPython' else _postdoc_display

    def exec_module(self, module):
        pass


# Last, so that an IPython that is installed comes first.
sys.meta_path.append(_PostdocIPythonFinder())


def _postdoc_flush_figures():
    pyplot = sys.modules.get('matplotlib.pyplot')
    if pyplot is None:
        return
    for number in pyplot.get_fignums():
        _postdoc_kernel.display(json.dumps(_postdoc_figure(pyplot.figure(number))), False)
    pyplot.close('all')


# plt.show() sends the figures at once, so a cell can show several in order.
def _postdoc_patch_show():
    pyplot = sys.modules.get('matplotlib.pyplot')
    if pyplot is not None and not getattr(pyplot.show, '_postdoc', False):
        def show(*args, **options):
            _postdoc_flush_figures()
        show._postdoc = True
        pyplot.show = show


def _postdoc_report(error):
    summary = traceback.TracebackException.from_exception(error)
    frames = list(summary.stack)
    start = next((index for index, frame in enumerate(frames) if frame.filename.startswith('<cell')), len(frames))
    summary.stack = traceback.StackSummary.from_list(frames[start:])
    lines = ''.join(summary.format()).rstrip().split('\\n')
    _postdoc_kernel.error(json.dumps({'ename': type(error).__name__, 'evalue': str(error), 'traceback': lines}))


async def _postdoc_run(code, filename):
    linecache.cache[filename] = (len(code), None, code.splitlines(True), filename)
    # A cell that draws with pyplot gets its show() before it runs.
    if re.search(r'\\bmatplotlib\\b', code):
        try:
            import matplotlib.pyplot
        except ImportError:
            pass
    _postdoc_patch_show()
    try:
        result = await eval_code_async(code, globals(), filename=filename)
    except BaseException as error:
        sys.stdout.flush()
        sys.stderr.flush()
        _postdoc_flush_figures()
        _postdoc_report(error)
        return False
    sys.stdout.flush()
    sys.stderr.flush()
    _postdoc_patch_show()
    if result is not None and not _postdoc_is_artist(result):
        builtins._ = result
        _postdoc_send(result, True)
        if _postdoc_is_figure(result):
            sys.modules['matplotlib.pyplot'].close(result)
    _postdoc_flush_figures()
    return True


def _postdoc_complete(code, cursor):
    import rlcompleter
    match = re.search(r'[A-Za-z_][\\w.]*$', code[:cursor])
    prefix = match.group(0) if match else ''
    items = []
    if prefix:
        completer = rlcompleter.Completer(globals())
        for index in range(300):
            try:
                item = completer.complete(prefix, index)
            except Exception:
                break
            if item is None:
                break
            items.append(item)
    return json.dumps({'prefix': prefix, 'items': items})
`;

  let pyodide = null;
  let runCell = null;
  let complete = null;
  // The run whose output this is: the id of a cell's run, or 'setup'.
  let current = null;

  const post = (message) => self.postMessage(message);

  // What Python prints goes to the run it belongs to, as it comes.
  function stream(name) {
    const decoder = new TextDecoder();

    return {
      write(buffer) {
        if (current !== null) {
          post({ type: 'stream', id: current, name, text: decoder.decode(buffer, { stream: true }) });
        }

        return buffer.length;
      }
    };
  }

  // Runs code as a cell. False when it failed, which it has reported.
  async function run(code, filename) {
    try {
      await pyodide.loadPackagesFromImports(code, {
        messageCallback: (message) => post({ type: 'status', state: 'installing', message }),
        errorCallback: () => {}
      });
    } catch {
      // A package that can't be loaded fails at its import, with a message from Python.
    }

    return runCell(code, filename);
  }

  async function install(packages, indexURL) {
    const names = packages.map((entry) => (typeof entry === 'string' ? entry : entry.name ?? entry.url));

    post({ type: 'status', state: 'installing', message: `Installing ${names.map((name) => name.split('/').pop()).join(', ')}` });
    await pyodide.loadPackage('micropip', { messageCallback: () => {} });

    const micropip = pyodide.pyimport('micropip');
    const together = [];
    const alone = [];
    let lock = null;

    for (const entry of packages) {
      if (typeof entry === 'string') {
        together.push(entry);
      } else if (entry.deps !== false) {
        together.push(entry.url ?? entry.name);
      } else if (entry.url) {
        alone.push(entry.url);
      } else {
        // micropip gives a package that Pyodide has the packages it needs, whatever it
        // is told, so the package's own file is installed instead.
        lock ??= await (await fetch(`${indexURL}pyodide-lock.json`)).json();

        const key = entry.name.toLowerCase().replace(/[-_.]+/g, '-');
        const file = lock.packages[key]?.file_name;

        alone.push(file ? `${indexURL}${file}` : entry.name);
      }
    }

    try {
      if (together.length) {
        await micropip.install(pyodide.toPy(together));
      }

      for (const spec of alone) {
        await micropip.install.callKwargs(spec, { deps: false });
      }
    } finally {
      micropip.destroy();
    }
  }

  async function boot({ indexURL, packages, files, setup, interrupt }) {
    post({ type: 'status', state: 'loading', message: 'Loading Python' });

    const { loadPyodide } = await importModule(`${indexURL}pyodide.mjs`);

    pyodide = await loadPyodide({ indexURL, env: { HOME, MPLBACKEND: 'agg' } });
    pyodide.setStdout(stream('stdout'));
    pyodide.setStderr(stream('stderr'));

    if (interrupt) {
      pyodide.setInterruptBuffer(new Int32Array(interrupt));
    }

    pyodide.registerJsModule('_postdoc_kernel', {
      display: (json, isResult) => post({ type: 'display', id: current, data: JSON.parse(json), isResult }),
      error: (json) => post({ type: 'error', id: current, ...JSON.parse(json) })
    });
    await pyodide.runPythonAsync(PRELUDE);
    runCell = pyodide.globals.get('_postdoc_run');
    complete = pyodide.globals.get('_postdoc_complete');

    if (packages.length) {
      await install(packages, indexURL);
    }

    for (const file of files) {
      const path = `${HOME}/${file.path.replace(/^\/+/, '')}`;

      post({ type: 'status', state: 'loading', message: `Fetching ${file.path}` });
      pyodide.FS.mkdirTree(path.slice(0, path.lastIndexOf('/')));

      if (file.url) {
        const response = await fetch(file.url);

        if (!response.ok) {
          throw new Error(`${file.path} couldn't be fetched: ${response.status} ${response.statusText}`);
        }

        pyodide.FS.writeFile(path, new Uint8Array(await response.arrayBuffer()));
      } else {
        pyodide.FS.writeFile(path, file.content);
      }
    }

    pyodide.FS.chdir(HOME);

    if (setup) {
      post({ type: 'status', state: 'loading', message: 'Running the setup' });
      current = 'setup';

      const ok = await run(setup, '<setup>');

      current = null;

      if (!ok) {
        throw new Error('The setup failed');
      }
    }

    return pyodide.runPython('import sys; sys.version.split()[0]');
  }

  async function handle(message) {
    switch (message.type) {
      case 'boot':
        try {
          post({ type: 'ready', python: await boot(message) });
        } catch (error) {
          post({ type: 'failed', message: String(error.message ?? error).split('\n').filter(Boolean).pop() });
        }

        break;
      case 'run': {
        let ok = false;

        current = message.id;
        post({ type: 'status', state: 'busy' });

        try {
          ok = await run(message.code, `<cell ${message.count}>`);
        } catch (error) {
          post({ type: 'error', id: message.id, ename: 'Error', evalue: String(error.message ?? error), traceback: [] });
        } finally {
          current = null;
        }

        post({ type: 'done', id: message.id, ok });
        post({ type: 'status', state: 'idle' });
        break;
      }
      case 'complete': {
        let result = { prefix: '', items: [] };

        try {
          result = JSON.parse(complete(message.code, message.cursor));
        } catch {
          // No names, then.
        }

        post({ type: 'completions', id: message.id, ...result });
        break;
      }
      default:
        break;
    }
  }

  let queue = Promise.resolve();

  self.onmessage = ({ data }) => {
    queue = queue.then(() => handle(data));
  };
}
