import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chdir } from 'node:process';

describe('import command', function () {
  const rootDirectory = process.cwd();
  const pathToPostdoc = resolve(rootDirectory, 'bin/postdoc.js');
  const postdoc = (...args) => spawnSync('node', [pathToPostdoc, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

  let tmpDir;

  before(async function () {
    tmpDir = await mkdtemp(join(tmpdir(), '.postdoc-import-'));
    chdir(tmpDir);

    postdoc('init', '--name', '.');
  });

  after(async function () {
    chdir(rootDirectory);
    await rm(tmpDir, { recursive: true, force: true });
  });

  // PostDoc's own command-line tool is built with commander, so it can be imported.
  test('should make a page and a page test for each command of a tool', async function () {
    const importProcess = postdoc('import', rootDirectory);

    assert.equal(importProcess.status, 0, importProcess.stderr);
    assert.match(importProcess.stdout, /Wrote \d+ pages, and their page tests/);

    const page = await readFile(join('content', 'postdoc', 'build', 'index.md'), 'utf8');

    assert.match(page, /^# build\n/);
    assert.match(page, /## Usage\n\n```sh\n.+\n```/);

    const pageTest = await readFile(join('test', 'pages', 'postdoc', 'build', 'index.js'), 'utf8');

    assert.match(pageTest, /^export default \{\n {2}url: '\/postdoc\/build\/index\.html',/);
    assert.match(pageTest, /export function headerAndUsageAreVisible\(\{ page \}\)/);
  });

  test('should not write over the pages it made before', function () {
    const importProcess = postdoc('import', rootDirectory);

    assert.equal(importProcess.status, 1);
    assert.match(importProcess.stderr, /exists already|already exists/);
  });

  test('should say why, and fail, for a folder that isn\'t a package with a tool', function () {
    const missing = postdoc('import', './nope');

    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /There's no package\.json in \.\/nope/);
    assert.doesNotMatch(missing.stderr, /\n\s+at /);

    const noTool = postdoc('import', '.');

    assert.equal(noTool.status, 1);
    assert.match(noTool.stderr, /has no command-line tool/);
  });
});
