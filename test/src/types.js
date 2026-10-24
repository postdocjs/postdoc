import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// The types are checked as a project that has PostDoc installed would check them: from
// node_modules/postdoc, through the exports of its package.json.
describe('The types', function () {
  const rootDirectory = process.cwd();
  const tsc = resolve(rootDirectory, 'node_modules', '.bin', 'tsc');

  let tmpDir;

  before(async function () {
    tmpDir = await mkdtemp(join(tmpdir(), 'postdoc-types-'));

    await mkdir(join(tmpDir, 'node_modules'));
    await symlink(rootDirectory, join(tmpDir, 'node_modules', 'postdoc'), 'dir');
    await symlink(join(rootDirectory, 'node_modules', '@types'), join(tmpDir, 'node_modules', '@types'), 'dir');
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({ type: 'module' }));
  });

  after(async function () {
    await rm(tmpDir, { recursive: true, force: true });
  });

  // Type-checks the files, and returns tsc's exit code and messages.
  async function check(files) {
    for (const [name, content] of Object.entries(files)) {
      await writeFile(join(tmpDir, name), content);
    }

    await writeFile(join(tmpDir, 'tsconfig.json'), JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        target: 'es2022',
        module: 'nodenext',
        moduleResolution: 'nodenext',
        allowJs: true,
        checkJs: true,
        skipLibCheck: true,
        types: ['node']
      },
      files: Object.keys(files)
    }));

    const result = spawnSync(tsc, ['-p', tmpDir], { encoding: 'utf8' });

    return { status: result.status, output: result.stdout + result.stderr };
  }

  // The lines of the file that tsc reports errors on.
  const errorLines = (output, file) => [...new Set([...output.matchAll(new RegExp(`${file.replace('.', '\\.')}\\((\\d+),`, 'g'))].map(([, line]) => Number(line)))];

  test('should accept the settings that PostDoc takes', async function () {
    const { status, output } = await check({
      'postdoc.config.ts': `
        import type { PostdocConfig } from 'postdoc';

        export default {
          contentPath: 'docs',
          testsPath: ['test', 'more-tests'],
          directories: { vitePublic: 'public' },
          apidocs: false,
          vite: { server: { port: 3000, strictPort: true }, logLevel: 'silent', plugins: [] },
          markdown: {
            syntaxHighlight: false,
            options: { gfmHeadingId: false, usePlaygrounds: false, useNotebooks: true, breaks: true },
            extensions: [{ gfm: true }]
          },
          pagefind: { outputDir: 'search' },
          logger: { noColors: true },
          nightwatch: { browser: ['chrome', 'firefox'], parallel: true, config: './nightwatch.conf.js', pageChecks: false },
          pwa: { enabled: true, manifest: { name: 'Docs' }, workbox: { globPatterns: ['**/*.html'] } },
          appSettings: {
            name: 'Docs',
            logo: '/logo.svg',
            nav: [{ title: 'Guide', url: '/guide/index.html', children: [{ title: 'Setup', url: '/guide/setup.html' }] }],
            github: { repo: 'acme/docs', branch: 'main' }
          }
        } satisfies PostdocConfig;
      `
    });

    assert.equal(status, 0, output);
  });

  test('should accept the configuration that postdoc init writes', async function () {
    const template = await readFile(join(rootDirectory, 'extra', 'templates', 'default', 'postdoc.config.js'), 'utf8');

    const { status, output } = await check({
      'postdoc.config.js': '// @ts-check\n' +
        template
          .replace('${project_name}', 'site')
          .replace('export default {', '/** @type {import(\'postdoc\').PostdocConfig} */\nexport default {')
    });

    assert.equal(status, 0, output);
  });

  test('should reject settings that are misspelt or of the wrong kind', async function () {
    const { status, output } = await check({
      'postdoc.config.ts': `
        import type { PostdocConfig } from 'postdoc';

        export const misspelt = { contenPath: 'docs' } satisfies PostdocConfig;
        export const wrongKind = { apidocs: 'yes', testsPath: 5 } satisfies PostdocConfig;
        export const wrongTheme = { markdown: { syntaxHighlight: { theme: 'github' } } } satisfies PostdocConfig;
      `
    });

    // Each of the three settings has an error, and the misspelt key gets a suggestion.
    assert.notEqual(status, 0);
    assert.deepEqual(errorLines(output, 'postdoc.config.ts'), [4, 5, 6]);
    assert.match(output, /Did you mean to write 'contentPath'/);
  });

  test('should type the client modules that pages import', async function () {
    const { status, output } = await check({
      'page.ts': `
        import { navigateTo, onLeave, onRender } from 'postdoc/page';
        import { configuration, session } from 'postdoc/dom';
        import 'postdoc/storymap';
        import 'postdoc/math';

        onRender((url) => {
          document.title = url.pathname + configuration.base;
        }, { forPage: (url) => url.pathname.startsWith('/guide/'), index: 1 });

        onRender(async () => {}, { forPage: /guide/ });
        onLeave((url, nextUrl) => console.log(url.href, nextUrl.href));

        await navigateTo('/guide/index.html');
        session.navigator.reload();
      `
    });

    assert.equal(status, 0, output);
  });

  test('should reject wrong uses of the client modules', async function () {
    const { status, output } = await check({
      'page.ts': `
        import { navigateTo, onRender } from 'postdoc/page';

        onRender('not a function');
        onRender(() => {}, { forPage: 'guide' });
        navigateTo(42);
      `
    });

    assert.notEqual(status, 0);
    assert.deepEqual(errorLines(output, 'page.ts'), [4, 5, 6]);
  });
});
