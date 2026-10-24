import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chdir } from 'node:process';

// Projects that are set up wrong, or have no init template: what the commands say.
describe('Projects without the init template, or with mistakes', function () {
  const rootDirectory = process.cwd();
  const pathToPostdoc = resolve(rootDirectory, 'bin/postdoc.js');
  const postdoc = (...args) => spawnSync('node', [pathToPostdoc, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

  let tmpDir;

  beforeEach(async function () {
    tmpDir = await mkdtemp(join(tmpdir(), '.postdoc-project-'));
    chdir(tmpDir);

    // The pages import PostDoc's client from the project, as from an installed package.
    await mkdir('node_modules');
    await symlink(rootDirectory, join('node_modules', 'postdoc'), 'dir');
    await writeFile('package.json', JSON.stringify({ name: 'docs', type: 'module' }));
  });

  afterEach(async function () {
    chdir(rootDirectory);
    await rm(tmpDir, { recursive: true, force: true });
  });

  test('should say where a configuration with an error is wrong, and still show the help and the version', async function () {
    await writeFile('postdoc.config.js', 'export default {\n  contentPath: "docs"\n  oops: 1\n};\n');

    const help = postdoc('--help');
    const version = postdoc('-v');
    const build = postdoc('build');
    const check = postdoc('check', '--json');

    assert.equal(help.status, 0);
    assert.match(help.stdout, /Usage: postdoc/);
    assert.equal(version.status, 0);
    assert.match(version.stdout, /\d+\.\d+\.\d+/);

    assert.equal(build.status, 1);
    assert.match(build.stderr, /The configuration in postdoc\.config\.js \(line 3\) can't be loaded: Unexpected identifier 'oops'/);
    assert.doesNotMatch(build.stderr, /\n\s+at /);

    assert.equal(check.status, 1);
    assert.deepEqual(JSON.parse(check.stdout).problems.map(({ kind }) => kind), ['configuration']);
  });

  test('should build the pages of a project without layouts with the theme\'s', async function () {
    await mkdir(join('docs', 'concepts'), { recursive: true });
    await writeFile(join('docs', 'index.md'), '# Welcome\n\nThe home page.\n');
    await writeFile(join('docs', 'concepts', 'basics.md'), '---\ntitle: Basics\n---\n\n# Basics\n\n## A part\n');

    const build = postdoc('build');

    assert.equal(build.status, 0, build.stderr);
    assert.equal(existsSync(join('out', 'index.html')), true);
    assert.equal(existsSync(join('out', 'concepts', 'basics.html')), true);
  });

  test('should stop with a message, not a stack trace, when there are no pages to build', async function () {
    const missing = postdoc('build');

    await mkdir('docs');
    const empty = postdoc('build');

    for (const build of [missing, empty]) {
      assert.equal(build.status, 1);
      assert.match(build.stderr, /There are no pages to build/);
      assert.doesNotMatch(build.stderr, /\n\s+at /);
    }

    assert.deepEqual((await readdir('.')).filter((name) => name.startsWith('.pd-tmp-')), []);
  });

  test('should fail the build of a page that names a layout no one has', async function () {
    await mkdir('docs');
    await writeFile(join('docs', 'index.md'), '# Welcome\n');
    await writeFile(join('docs', 'odd.md'), '---\nlayout: nowhere\n---\n\n# Odd\n');

    const build = postdoc('build');

    assert.equal(build.status, 1);
    assert.match(build.stderr, /left out 1 page that couldn't be made: docs\/odd\.md/);
    assert.equal(existsSync(join('out', 'index.html')), true);
  });

  test('should not leave a temporary folder behind when it refuses an output directory', async function () {
    await mkdir('docs');
    await writeFile(join('docs', 'index.md'), '# Welcome\n');

    const build = postdoc('build', '--out-dir', '.');

    assert.equal(build.status, 1);
    assert.deepEqual((await readdir('.')).filter((name) => name.startsWith('.pd-tmp-')), []);
  });

  test('should refuse to write a search index when search is off, or when there\'s no terminal to ask where', async function () {
    await mkdir('docs');
    await writeFile(join('docs', 'index.md'), '# Welcome\n');

    const noPath = postdoc('pagefind');

    assert.equal(noPath.status, 1);
    assert.match(noPath.stderr, /--path <outputPath>/);

    const written = postdoc('pagefind', '--path', 'search-index');

    assert.equal(written.status, 0, written.stderr);
    assert.equal(existsSync(join('search-index', 'pagefind.js')), true);

    await writeFile('postdoc.config.js', 'export default { pagefind: { enabled: false } };\n');
    const off = postdoc('pagefind', '--path', 'other-index');

    assert.equal(off.status, 1);
    assert.match(off.stderr, /Search is turned off/);
    assert.equal(existsSync('other-index'), false);
    assert.deepEqual((await readdir('.')).filter((name) => name.startsWith('.pd-tmp-')), []);
  });
});
