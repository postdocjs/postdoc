/**
 * Monaco, the editor of VS Code, for the playground and the notebook. It comes from a
 * CDN through its AMD build, as the package is far too big for every PostDoc install
 * to carry it. Its version is pinned, as that build is deprecated upstream and the
 * files of a version don't change.
 */

const MONACO = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.57.0/min';

let loading = null;

// The files of a playground are a Node.js project, whose packages the editor doesn't
// have: it completes and checks the syntax, but doesn't report what it can't resolve.
function setUp(monaco) {
  const { typescript } = monaco.languages;

  for (const defaults of [typescript.javascriptDefaults, typescript.typescriptDefaults]) {
    defaults.setCompilerOptions({
      target: typescript.ScriptTarget.ESNext,
      module: typescript.ModuleKind.ESNext,
      moduleResolution: typescript.ModuleResolutionKind.NodeJs,
      allowJs: true,
      allowNonTsExtensions: true,
      lib: ['esnext']
    });
    defaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false });
  }
}

// Monaco's loader is a script of its own, which then loads the editor, once a page.
export function loadMonaco() {
  loading ??= new Promise((resolve, reject) => {
    const start = () => {
      globalThis.require.config({ paths: { vs: `${MONACO}/vs` } });
      globalThis.require(['vs/editor/editor.main'], () => {
        setUp(globalThis.monaco);
        resolve(globalThis.monaco);
      }, reject);
    };

    if (document.querySelector(`script[src="${MONACO}/vs/loader.js"]`)) {
      start();

      return;
    }

    const script = Object.assign(document.createElement('script'), { src: `${MONACO}/vs/loader.js` });

    script.addEventListener('load', start);
    script.addEventListener('error', () => {
      loading = null;
      reject(new Error('The editor couldn\'t be loaded.'));
    });
    document.head.append(script);
  });

  return loading;
}
