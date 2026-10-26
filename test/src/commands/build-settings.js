import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chdir } from 'node:process';

describe('build command, with public files and ignored layouts of its own', function () {
  const rootDirectory = process.cwd();
  const pathToPostdoc = resolve(rootDirectory, 'bin/postdoc.js');

  let tmpDir;
  let buildProcess;
  before(async function () {
    // Not a hidden folder, which `**` in the ignore pattern wouldn't match.
    tmpDir = await mkdtemp(join(tmpdir(), 'postdoc-build-'));
    chdir(tmpDir);

    spawnSync('node', [pathToPostdoc, 'init', '--name', '.']);

    await mkdir('node_modules');
    await symlink(rootDirectory, join('node_modules', 'postdoc'), 'dir');
    await mkdir('static');
    await writeFile(join('static', 'dot.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>');

    // content/about/index.md names about.ejs.
    const configuration = await readFile('postdoc.config.js', 'utf8');

    await writeFile('postdoc.config.js', configuration
      .replace('layouts: []', 'layouts: [\'**/layouts/about.ejs\']')
      .replace('logLevel: \'silent\'', 'logLevel: \'silent\', publicDir: \'static\''));

    buildProcess = spawnSync('node', [pathToPostdoc, 'build'], { encoding: 'utf8' });
  });

  after(async function () {
    chdir(rootDirectory);
    await rm(tmpDir, { recursive: true });
  });

  // Builds run Vite in a temporary folder, where a relative publicDir isn't.
  test('should copy the public files from vite.publicDir', function () {
    assert.equal(buildProcess.status, 0, buildProcess.stderr);
    assert.equal(existsSync(join('out', 'dot.svg')), true);
  });

  test('should build the pages whose layout is in ignore.layouts', function () {
    assert.equal(buildProcess.status, 0, buildProcess.stderr);
    assert.equal(existsSync(join('out', 'about', 'index.html')), true);
    assert.equal(existsSync(join('out', 'about.html')), false);
  });
});
