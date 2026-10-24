import assert from 'node:assert/strict';
import { chdir } from 'node:process';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';

import Configuration from '../../../../lib/configuration.js';

describe('create pages command', function () {
  const rootDirectory = process.cwd();
  const pathToPostdoc = resolve(rootDirectory, 'bin/postdoc.js');

  let tmpDir;
  before(async function () {
    tmpDir = await mkdtemp(join(tmpdir(), '.foo'));
    chdir(tmpDir);

    spawnSync('node', [pathToPostdoc, 'init', '--name', '.']);

    await Configuration.initialise({});
  });

  after(async function () {
    chdir(rootDirectory);
    await rm(tmpDir, { recursive: true });
  });

  // What the page is called, its Markdown file, its page test and its URL.
  const pages = [
    ['a url without extension', 'foo', 'foo.md', 'foo.js', '/foo.html'],
    ['a url with extension', 'boo.md', 'boo.md', 'boo.js', '/boo.html'],
    ['a url without extension inside subfolder', 'coo/foo', 'coo/foo.md', 'coo/foo.js', '/coo/foo.html'],
    ['a url with extension inside subfolder', 'coo/boo.md', 'coo/boo.md', 'coo/boo.js', '/coo/boo.html'],
    ['an .html url', '/guide/faq.html', 'guide/faq.md', 'guide/faq.js', '/guide/faq.html']
  ];

  for (const [description, name, pagePath, testPath, url] of pages) {
    it(`providing ${description} should create the page and its page test`, async function () {
      spawnSync('node', [pathToPostdoc, 'create', 'page', '-n', name]);

      const configuration = Configuration.get();

      assert.equal(existsSync(join(configuration.contentPath, pagePath)), true);

      // Page tests go in test/pages, where the Nightwatch plugin for PostDoc runs them.
      const pageTest = await readFile(join(configuration.testsPath, 'pages', testPath), 'utf8');

      assert.match(pageTest, new RegExp(`url: '${url}'`));
    });
  }

  it('should leave a page that exists alone, and fail', async function () {
    const configuration = Configuration.get();
    const pagePath = join(configuration.contentPath, 'foo.md');

    const content = await readFile(pagePath, 'utf8');

    const createProcess = spawnSync('node', [pathToPostdoc, 'create', 'page', '-n', 'foo']);

    assert.equal(createProcess.status, 1);
    assert.match(createProcess.stderr.toString(), /exists already/);
    assert.equal(await readFile(pagePath, 'utf8'), content);
  });

  it('should make a page that builds publish, not a draft', async function () {
    const { contentPath } = Configuration.get();

    assert.doesNotMatch(await readFile(join(contentPath, 'foo.md'), 'utf8'), /draft:/);
  });

  it('should start a page as a draft with --draft, without a page test', async function () {
    const { contentPath, testsPath } = Configuration.get();

    const createProcess = spawnSync('node', [pathToPostdoc, 'create', 'page', '-n', '/notes/idea', '--draft']);

    assert.equal(createProcess.status, 0);
    assert.match(await readFile(join(contentPath, 'notes', 'idea.md'), 'utf8'), /^---\ndraft: true\n---\n/);
    assert.equal(existsSync(join(testsPath, 'pages', 'notes', 'idea.js')), false);
  });

  it('should refuse a page outside the content directory', function () {
    for (const name of ['../escaped', '../../escaped.md', '/../outside']) {
      const createProcess = spawnSync('node', [pathToPostdoc, 'create', 'page', '-n', name]);

      assert.equal(createProcess.status, 1, name);
      assert.match(createProcess.stderr.toString(), /outside the content directory/, name);
    }

    assert.equal(existsSync(join(tmpDir, 'escaped.md')), false);
    assert.equal(existsSync(join(tmpDir, '..', 'escaped.md')), false);
    assert.equal(existsSync(join(tmpDir, 'outside.md')), false);
  });

  it('should stop with an error, not wait for an answer, without a name and a terminal', function () {
    const createProcess = spawnSync('node', [pathToPostdoc, 'create', 'page'], { stdio: ['ignore', 'pipe', 'pipe'] });

    assert.equal(createProcess.status, 1);
    assert.match(createProcess.stderr.toString(), /--name <url>/);
  });

  it('should warn when a page test and a folder would both be the same page object', function () {
    spawnSync('node', [pathToPostdoc, 'create', 'page', '-n', '/topics']);

    const createProcess = spawnSync('node', [pathToPostdoc, 'create', 'page', '-n', '/topics/first']);
    const output = createProcess.stdout.toString() + createProcess.stderr.toString();

    assert.equal(createProcess.status, 0);
    assert.match(output, /both make a page object called topics/);
  });

  it('should give the init template\'s page tests the paths that create page writes', function () {
    const createProcess = spawnSync('node', [pathToPostdoc, 'create', 'page', '-n', '/guide/troubleshooting']);
    const output = createProcess.stdout.toString() + createProcess.stderr.toString();

    assert.equal(createProcess.status, 0);
    assert.doesNotMatch(output, /both make a page object/);
  });
});
