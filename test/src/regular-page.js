import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { chdir } from 'node:process';

import Configuration from '../../lib/configuration.js';
import Logger from '../../lib/logger.js';
import RegularPage from '../../lib/regular-page.js';

async function createEmptyFiles(filePaths) {
  for (const filePath of filePaths) {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, '', 'utf-8');
  }
}

function findLayoutFor(contentFilePath) {
  const page = new RegularPage(resolve('docs', contentFilePath), '.pd-tmp-test');

  return relative(process.cwd(), page.layoutFilePath);
}

describe('RegularPage layout selection', function () {
  const rootDirectory = process.cwd();

  let tmpDir;
  before(async function (done) {
    tmpDir = await mkdtemp(join(tmpdir(), 'test-doc'));
    chdir(tmpDir);

    await createEmptyFiles([
      'postdoc/layouts/index.ejs',
      'postdoc/layouts/guide/index.ejs',
      'theme/layouts/guide/index.ejs',
      'theme/layouts/guide/changelog.ejs',
      'theme/layouts/reference/index.ejs',
      'theme/layouts/story.ejs',
      'postdoc/layouts/wide.ejs',
      'theme/layouts/wide.ejs'
    ]);
    await mkdir('docs/stories', { recursive: true });
    await writeFile('docs/stories/voyage.md', '---\nlayout: story\n---\n\n# Voyage\n', 'utf-8');
    await writeFile('docs/stories/wide.md', '---\nlayout: wide\n---\n', 'utf-8');
    await writeFile('docs/stories/missing.md', '---\nlayout: missing\n---\n', 'utf-8');
    await writeFile('postdoc/layouts/source.ejs', '<%= page.sourcePath %>', 'utf-8');
    await mkdir('docs/notes', { recursive: true });
    await writeFile('docs/notes/sources.md', '---\nlayout: source\n---\n', 'utf-8');
    await writeFile('postdoc.json', JSON.stringify({ theme: './theme' }), 'utf-8');
    await Configuration.initialise({});
    Logger.initialise();

    done();
  });

  after(async function (done) {
    chdir(rootDirectory);
    await rm(tmpDir, { recursive: true });
    done();
  });

  it('should prefer the project layout over the theme layout at the same level', function () {
    assert.equal(findLayoutFor('guide/setup.md'), join('postdoc', 'layouts', 'guide', 'index.ejs'));
  });

  it('should prefer a layout named after the page over a folder layout', function () {
    assert.equal(findLayoutFor('guide/changelog.md'), join('theme', 'layouts', 'guide', 'changelog.ejs'));
  });

  it('should prefer a theme folder layout over a project layout higher up', function () {
    assert.equal(findLayoutFor('reference/api.md'), join('theme', 'layouts', 'reference', 'index.ejs'));
  });

  it('should use the layout that the front matter names', function () {
    assert.equal(findLayoutFor('stories/voyage.md'), join('theme', 'layouts', 'story.ejs'));
  });

  it('should prefer the project layout that the front matter names over the theme one', function () {
    assert.equal(findLayoutFor('stories/wide.md'), join('postdoc', 'layouts', 'wide.ejs'));
  });

  it('should name a layout from the front matter that does not exist', function () {
    assert.throws(() => findLayoutFor('stories/missing.md'), (error) => {
      return error.reason === 'page:missed-named-layout' && error.parameters.layoutName === 'missing';
    });
  });

  it('should fall back to the root layout', function () {
    assert.equal(findLayoutFor('other/page.md'), join('postdoc', 'layouts', 'index.ejs'));
    assert.equal(findLayoutFor('index.md'), join('postdoc', 'layouts', 'index.ejs'));
  });

  it('should give the layout the path of the page\'s Markdown file', async function () {
    const markdownCompiler = { compile: async () => [{ layout: 'source' }, '<p></p>'] };
    const page = new RegularPage(resolve('docs', 'notes', 'sources.md'), '.pd-tmp-test', markdownCompiler);

    assert.equal(await page.compile([]), 'docs/notes/sources.md');
  });
});
