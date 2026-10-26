import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chdir } from 'node:process';

import ApiPage from '../../lib/api-page.js';
import Configuration from '../../lib/configuration.js';
import Logger from '../../lib/logger.js';
import MarkdownCompiler from '../../lib/markdown-compiler.js';

const FILES = {
  // Nightwatch's commands document themselves with @method, not @name.
  'click.js': `/**
 * Clicks an element.
 *
 * @example
 * this.demoTest = function (browser) {
 *   browser.click('#main');
 * };
 *
 * @method click
 * @param {string} selector The element.
 */
module.exports = function click(selector) {};
`,
  'named.js': `/**
 * A documented module.
 *
 * @name named
 */
export default {};
`,
  'hidden.js': `/**
 * Only for the library itself.
 *
 * @ignore
 */
export function hidden() {}
`,
  'mixed.js': `/**
 * Shown.
 *
 * @method shown
 */
export function shown() {}

/**
 * Not shown.
 *
 * @method notShown
 * @ignore
 */
export function notShown() {}
`
};

describe('API pages', function () {
  const rootDirectory = process.cwd();

  let tmpDir;
  let markdownCompiler;

  const createPage = (fileName) => new ApiPage(resolve('api', fileName), '.pd-tmp-test', markdownCompiler);
  const commentsOf = async (fileName) => JSON.parse(await createPage(fileName).compile([]));

  before(async function (done) {
    tmpDir = await mkdtemp(join(tmpdir(), 'test-doc'));
    chdir(tmpDir);

    await mkdir('api');
    await mkdir(join('postdoc', 'layouts'), { recursive: true });

    for (const [fileName, content] of Object.entries(FILES)) {
      await writeFile(join('api', fileName), content, 'utf-8');
    }

    await writeFile(join('postdoc', 'layouts', 'apidocs.ejs'), '<%- JSON.stringify(page.comments) %>', 'utf-8');
    await writeFile('postdoc.json', JSON.stringify({ apidocs: { source: './api' } }), 'utf-8');
    await Configuration.initialise({});
    Logger.initialise();

    markdownCompiler = new MarkdownCompiler();
    await markdownCompiler.initialise();

    done();
  });

  after(async function (done) {
    chdir(rootDirectory);
    await rm(tmpDir, { recursive: true });
    done();
  });

  afterEach(function () {
    Configuration.get().apidocs.requireName = false;
  });

  it('should make a page of every file with a comment, as 0.3.0-preview4 did', async function () {
    assert.equal(await createPage('click.js').shouldCompile(), true);
    assert.equal(await createPage('named.js').shouldCompile(), true);
  });

  it('should make pages only of the files with a @name comment with requireName', async function () {
    Configuration.get().apidocs.requireName = true;

    assert.equal(await createPage('click.js').shouldCompile(), false);
    assert.equal(await createPage('named.js').shouldCompile(), true);
  });

  it('should leave out the comments with an @ignore tag', async function () {
    assert.equal(await createPage('hidden.js').shouldCompile(), false);
    assert.deepEqual((await commentsOf('mixed.js')).map(({ name }) => name), ['shown']);
  });

  it('should keep each example as written, and as HTML', async function () {
    const [comment] = await commentsOf('click.js');

    assert.deepEqual(comment.example, ['this.demoTest = function (browser) {\n  browser.click(\'#main\');\n};']);
    assert.equal(comment.exampleHtml.length, 1);
    assert.match(comment.exampleHtml[0], /^<p>this\.demoTest/);
  });
});
