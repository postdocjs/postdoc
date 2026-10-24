import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { chdir } from 'node:process';
import Configuration from '../../../lib/configuration.js';
import { existsSync } from 'node:fs';

// Stylesheets that different sets of pages share: `a` every page, `b` the API reference
// pages, and `c` those and the home page. The API reference pages link them in this order.
const STYLESHEETS = {
  'src/layouts/api_reference/index.ejs': ['a', 'b', 'c'],
  'src/layouts/index.ejs': ['a', 'c'],
  'src/layouts/guide/index.ejs': ['a'],
  'src/layouts/about/index.ejs': ['a']
};

describe('build command', function () {
  const rootDirectory = process.cwd();
  const pathToPostdoc = resolve(rootDirectory, 'bin/postdoc.js');

  let tmpDir;
  before(async function (done) {
    tmpDir = await mkdtemp(join(tmpdir(), '.foo'));
    chdir(tmpDir);

    spawnSync('node', [pathToPostdoc, 'init', '--name', '.']);

    // The pages import PostDoc's client from the project, as from an installed package.
    await mkdir('node_modules');
    await symlink(rootDirectory, join('node_modules', 'postdoc'), 'dir');

    await mkdir(join('src', 'css'), { recursive: true });

    for (const name of ['a', 'b', 'c']) {
      await writeFile(join('src', 'css', `order-${name}.css`), `.order-${name} { color: red; }\n`);
    }

    for (const [layout, names] of Object.entries(STYLESHEETS)) {
      const links = names.map((name) => `<link rel="stylesheet" href="/src/css/order-${name}.css" />\n`).join('');
      // The project has its home and about layouts, and the theme has the others.
      const themeLayout = join(rootDirectory, 'lib', 'theme', 'default', layout.replace('src/', ''));
      const html = await readFile(existsSync(layout) ? layout : themeLayout, 'utf8');

      await mkdir(dirname(layout), { recursive: true });
      await writeFile(layout, html.replace('</head>', links + '</head>'));
    }

    await Configuration.initialise({});

    spawnSync('node', [pathToPostdoc, 'build']);

    done();
  });

  after(async function (done) {
    chdir(rootDirectory);
    await rm(tmpDir, { recursive: true });
    done();
  });

  test('check if build command produced folder with builded assets', async function() {
    const configuration = Configuration.get();

    const outputFolder = configuration.outputPath;

    const folderExists = existsSync(outputFolder);

    assert.equal(folderExists, true);

    const files = await readdir(outputFolder);

    assert.equal(files.length > 0, true);
  });

  // Rolldown puts the chunks that more pages share first, which would put `b` after `c`.
  test('should keep the stylesheets that pages share in the order that a page links them', async function () {
    const { outputPath } = Configuration.get();

    const html = await readFile(join(outputPath, 'api_reference', 'index.html'), 'utf8');
    const stylesheets = [...html.matchAll(/<link rel="stylesheet"[^>]*href="([^"]+)"/g)]
      .map(([, href]) => readFile(join(outputPath, href), 'utf8'));
    const css = (await Promise.all(stylesheets)).join('\n');
    const positions = ['a', 'b', 'c'].map((name) => css.indexOf(`.order-${name}`));

    assert.equal(positions.every((position) => position >= 0), true);
    assert.deepEqual(positions.toSorted((a, b) => a - b), positions);
  });
});
