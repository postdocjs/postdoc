import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

describe('The help of the commands', function () {
  const pathToPostdoc = resolve(process.cwd(), 'bin/postdoc.js');
  const help = (...args) => spawnSync('node', [pathToPostdoc, ...args, '--help'], { encoding: 'utf8' }).stdout;

  test('should show the values that options take, and their defaults', function () {
    const run = help('run');
    const screenshot = help('screenshot');

    assert.match(run, /--port <port> \/ -p/);
    assert.match(run, /--open \[path\] \/ -o/);
    assert.match(screenshot, /--width <widths>/);
    assert.match(screenshot, /\(default: "1280"\)/);
  });

  test('should show the whole command in the usage, and describe every command', function () {
    assert.match(help('create', 'page'), /Usage: postdoc create page \[options\]/);
    assert.match(help('test'), /Usage: postdoc test \[options\]/);

    const commands = help().split('Commands:')[1];

    for (const name of ['run', 'init', 'test', 'build', 'import', 'create', 'preview', 'pagefind', 'check', 'screenshot']) {
      assert.match(commands, new RegExp(`^ {2}${name} +\\S`, 'm'), name);
    }
  });

  test('should keep -h for the help, not for --host', function () {
    assert.match(help('run'), /--host \[url\] {2,}/);
    assert.doesNotMatch(help('run'), /-h \|/);

    const run = spawnSync('node', [pathToPostdoc, 'run', '-h'], { encoding: 'utf8', timeout: 20000 });

    assert.equal(run.status, 0);
    assert.match(run.stdout, /Usage: postdoc run/);
  });
});
