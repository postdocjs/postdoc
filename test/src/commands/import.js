import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
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

    // PostDoc writes an option as `--port <port> / -p`.
    const runPage = await readFile(join('content', 'postdoc', 'run', 'index.md'), 'utf8');

    assert.match(runPage, /^- `--port <port>` \| `-p` Serve on this port, and fail if it is taken\.$/m);
  });

  test('should list the options of a tool with the help that commander writes', async function () {
    await mkdir(join('pizza-cli', 'bin'), { recursive: true });
    await mkdir(join('pizza-cli', 'node_modules'));
    await symlink(join(rootDirectory, 'node_modules', 'commander'), join('pizza-cli', 'node_modules', 'commander'), 'dir');
    await writeFile(join('pizza-cli', 'package.json'), JSON.stringify({
      name: 'pizza-cli',
      type: 'module',
      bin: { pizza: './bin/pizza.js' },
      dependencies: { commander: '*' }
    }));
    await writeFile(join('pizza-cli', 'bin', 'pizza.js'), `import { Command } from 'commander';

const program = new Command();

program.name('pizza').description('Orders a pizza.').version('1.0.0')
  .option('-p, --pizza-type <type>', 'the flavour of the pizza, with a description long enough to go on in a second line')
  .option('--no-sauce', 'leaves out the sauce')
  .option('-s <size>', 'the size');
program.command('serve').description('starts the shop').action(() => {});
program.parse();
`);

    const importProcess = postdoc('import', 'pizza-cli');

    assert.equal(importProcess.status, 0, importProcess.stderr);

    const page = await readFile(join('content', 'pizza', 'index.md'), 'utf8');

    assert.match(page, /^- `--version` \| `-V` output the version number$/m);
    assert.match(page, /^- `--pizza-type <type>` \| `-p` the flavour of the pizza, with a description long enough to go on in a second line$/m);
    assert.match(page, /^- `--no-sauce` leaves out the sauce$/m);
    assert.match(page, /^- `-s <size>` the size$/m);
    assert.match(page, /^- \*\*serve\*\* starts the shop$/m);
    assert.ok(existsSync(join('content', 'pizza', 'serve', 'index.md')));
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
