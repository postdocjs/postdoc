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

  it('should leave a page that exists alone', async function () {
    const configuration = Configuration.get();
    const pagePath = join(configuration.contentPath, 'foo.md');

    const content = await readFile(pagePath, 'utf8');

    spawnSync('node', [pathToPostdoc, 'create', 'page', '-n', 'foo']);

    assert.equal(await readFile(pagePath, 'utf8'), content);
  });
});
