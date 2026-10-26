import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chdir } from 'node:process';

const LAYOUT = `<%
const { greeting } = await _import('../../helper.js');
%>
<!DOCTYPE html>
<html lang="en">
<head><title><%= page.title %></title></head>
<body>
<main><p class="greeting"><%= greeting %> from src/layouts</p><%- page.content %></main>
<%- include('footer') %>
</body>
</html>
`;

// A project written for 0.3.0-preview4: its settings, its folders and its templates.
describe('A project of 0.3.0-preview4', function () {
  const rootDirectory = process.cwd();
  const pathToPostdoc = resolve(rootDirectory, 'bin/postdoc.js');
  const postdoc = (...args) => spawnSync('node', [pathToPostdoc, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

  let tmpDir;

  beforeEach(async function () {
    tmpDir = await mkdtemp(join(tmpdir(), '.postdoc-preview4-'));
    chdir(tmpDir);

    await mkdir('node_modules');
    await symlink(rootDirectory, join('node_modules', 'postdoc'), 'dir');
    await writeFile('package.json', JSON.stringify({ name: 'docs', type: 'module' }));
    await writeFile('postdoc.config.js', `export default {
  directories: {
    content: './docs',
    output: './out',
    layouts: 'src/layouts',
    includes: 'src/includes'
  },
  apidocs: {
    source: null,
    layout: 'api.ejs'
  }
};
`);

    await mkdir('docs');
    await mkdir(join('src', 'layouts'), { recursive: true });
    await mkdir(join('src', 'includes'));
    await writeFile(join('docs', 'index.md'), '---\ntitle: Home\n---\n\n# Home\n');
    await writeFile(join('docs', 'second.md'), '---\ntitle: Second\n---\n\n# Second\n');
    await writeFile(join('src', 'layouts', 'index.ejs'), LAYOUT);
    await writeFile(join('src', 'includes', 'footer.ejs'), '<footer>From src/includes</footer>');
    await writeFile('helper.js', 'export const greeting = "Hello";\n');
  });

  afterEach(async function () {
    chdir(rootDirectory);
    await rm(tmpDir, { recursive: true, force: true });
  });

  test('should pass the check, with a warning for each setting of the older version', async function () {
    const check = postdoc('check', '--json');
    const result = JSON.parse(check.stdout);

    assert.equal(check.status, 0, check.stdout);
    assert.deepEqual(result.problems, []);
    assert.deepEqual(result.warnings.map(({ key }) => key), ['directories.content', 'directories.output', 'baseDir', 'apidocs.layout', '_import']);
  });

  test('should build with its own layouts and no theme, and warn once about each setting', async function () {
    const build = postdoc('build');
    const output = build.stdout + build.stderr;

    assert.equal(build.status, 0, output);

    for (const message of ['directories.content is now contentPath', 'apidocs.layout is now apidocs.layoutName', '_import() is now importModule()']) {
      assert.equal(output.split(message).length - 1, 1, message);
    }

    const html = await readFile(join('out', 'second.html'), 'utf8');

    assert.match(html, /Hello from src\/layouts/);
    assert.match(html, /From src\/includes/);

    // Files of the default theme stay out of a project that never had one.
    assert.equal(existsSync(join('out', 'js', 'toggleSideMenu.js')), false);
    assert.equal(existsSync(join('out', 'favicon_16.png')), false);
  });
});
