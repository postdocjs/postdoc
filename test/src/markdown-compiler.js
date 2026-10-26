import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chdir } from 'node:process';
import MarkdownCompiler from '../../lib/markdown-compiler.js';
import Configuration from '../../lib/configuration.js';

describe('MarkdownCompiler module', function () {
  const rootDirectory = process.cwd();

  let tmpDir;
  before(async function (done) {
    tmpDir = await mkdtemp(join(tmpdir(), 'test-doc'));
    chdir(tmpDir);

    await Configuration.initialise({});

    done();
  });

  after(async function (done) {
    chdir(rootDirectory);
    await rm(tmpDir, { recursive: true });
    done();
  });

  test('should extract metadata from .md file', async function (client) {
    const filename = 'file.md';

    await writeFile(
      filename,
      `---
draft: true
title: This title
---

# Main header

> Intelligence is the ability to avoid doing work, yet getting the work done.
> - Linus Torvalds`,
      'utf-8'
    );

    const markdownContent = await readFile(filename, 'utf8');

    const markdownCompiler = new MarkdownCompiler();
    await markdownCompiler.initialise();

    const [attributes, content] = await markdownCompiler.compile(
      markdownContent
    );

    assert.equal(attributes.draft, true);
    assert.equal(attributes.title, 'This title');
  });
});

describe('MarkdownCompiler content features', function () {
  const rootDirectory = process.cwd();

  let tmpDir;
  let markdownCompiler;
  before(async function (done) {
    tmpDir = await mkdtemp(join(tmpdir(), 'test-doc'));
    chdir(tmpDir);

    await writeFile('postdoc.json', JSON.stringify({ appSettings: { project: 'Demo' } }), 'utf-8');
    await Configuration.initialise({});

    markdownCompiler = new MarkdownCompiler();
    await markdownCompiler.initialise();

    done();
  });

  after(async function (done) {
    chdir(rootDirectory);
    await rm(tmpDir, { recursive: true });
    done();
  });

  test('should interpolate front matter and app settings outside code only', async function () {
    const [, content] = await markdownCompiler.compile(`---
title: Guide
---

{{ title }} for {{ appSettings.project }}, see {{ unknown }}.

Inline \`{{ title }}\` stays.

\`\`\`md
{{ title }}
\`\`\`
`);

    assert.match(content, /<p>Guide for Demo, see {{ unknown }}\.<\/p>/);
    assert.match(content, /<code>{{ title }}<\/code>/);
    assert.ok(!content.includes('undefined'));
    assert.equal(content.match(/Guide/g).length, 1);
  });

  test('should render block content and an optional headline in admonitions', async function () {
    const [, content] = await markdownCompiler.compile(`::: tip
First line.

- one
- two
:::

::: warning Custom title
Text.
:::

!!! note "MkDocs title"
    Indented **text**.
`);

    assert.match(content, /<div class="admonition tip"><p class="admonition-title">Tip<\/p><div class="content"><p>First line\.<\/p>\n<ul>/);
    assert.match(content, /<p class="admonition-title">Custom title<\/p><div class="content"><p>Text\.<\/p>/);
    assert.match(content, /<p class="admonition-title">MkDocs title<\/p><div class="content"><p>Indented <strong>text<\/strong>\.<\/p>/);
  });

  test('should show the first tab of a code group by default', async function () {
    const [, content] = await markdownCompiler.compile(`::: code-group
\`\`\`sh [npm]
npm i -D postdoc
\`\`\`

\`\`\`sh [pnpm]
pnpm add -D postdoc
\`\`\`
:::
`);

    assert.equal(content.match(/class="nav-link active"/g).length, 1);
    assert.equal(content.match(/aria-selected="true"/g).length, 1);
    assert.equal(content.match(/class="tab-pane active"/g).length, 1);
    assert.match(content, />npm<\/button>/);
  });

  test('should leave a code group that a sentence mentions as it is', async function () {
    const [, content] = await markdownCompiler.compile(`Put the blocks between \`::: code-group\` and \`:::\`.

A sentence about ::: code-group in the middle.
`);

    assert.match(content, /<p>Put the blocks between <code>::: code-group<\/code> and <code>:::<\/code>\.<\/p>/);
    assert.match(content, /<p>A sentence about ::: code-group in the middle\.<\/p>/);
  });

  test('should merge cells across columns and rows', async function () {
    const [, content] = await markdownCompiler.compile(`| Command | Builds | Serves |
| --- | --- | --- |
| run | On request ||
| build | Yes | No |
| preview | ^ | Yes |
`);

    assert.match(content, /<td colspan=2>On request<\/td>/);
    assert.match(content, /<td rowspan=2>Yes<\/td>/);
    assert.ok(!content.includes('>^<'));
  });

  test('should render the settings and the steps of a storymap', async function () {
    const [, content] = await markdownCompiler.compile(`::: storymap
\`\`\`yaml
sources:
  track: { type: geojson, data: /data/track.geojson }
layers:
  - { id: track, type: line, source: track }
\`\`\`

### Leaving port {center="-157.86,21.3" zoom=9 until="2023-07-17"}

The ship left Honolulu.

### The crossing {bounds="-160,0,-150,22" show=track}

It crossed the equator.
:::
`);

    const configuration = JSON.parse(content.match(/<script type="application\/json" class="storymap-configuration">([\s\S]*?)<\/script>/)[1]);
    const views = [...content.matchAll(/data-view="([^"]*)"/g)].map(([, view]) => JSON.parse(view.replace(/&quot;/g, '"')));

    assert.equal(configuration.sources.track.data, '/data/track.geojson');
    assert.equal(content.match(/class="storymap-step"/g).length, 2);
    assert.deepEqual(views, [
      { center: [-157.86, 21.3], zoom: 9, until: '2023-07-17' },
      { bounds: [-160, 0, -150, 22], show: ['track'] }
    ]);
    assert.match(content, /<h3[^>]*>Leaving port<\/h3>/);
  });

  test('should let storymap steps hold containers when it opens with four colons', async function () {
    const [, content] = await markdownCompiler.compile(`:::: storymap
## A step {zoom=3}

::: tip
Inside a step.
:::
::::
`);

    assert.equal(content.match(/class="storymap-step"/g).length, 1);
    assert.match(content, /class="storymap-step"[^>]*>[\s\S]*tip[\s\S]*Inside a step\.[\s\S]*<\/section>/);
  });

  test('should render the pictures of a storymap\'s steps', async function () {
    const [, content] = await markdownCompiler.compile(`::: storymap
## Leaving port {image="/photos/harbour.jpg" alt="A ship at the quay"}

The ship left Honolulu.

## The crossing

It crossed the equator.
:::
`);

    assert.match(content, /<h2[^>]*>Leaving port<\/h2>\s*<img class="storymap-image" src="\/photos\/harbour\.jpg" alt="A ship at the quay">\s*<p>The ship left Honolulu\.<\/p>/);
    assert.equal(content.match(/<img/g).length, 1);
  });

  test('should render the figure that a storymap step shows over the map', async function () {
    const [, content] = await markdownCompiler.compile(`::: storymap
## On the equator {zoom=8 figure="/charts/equator.webp" alt="The layer rises at dusk"}

The drone circled here.

## The way west {zoom=5}
:::
`);

    // After the heading, so it reads with the step, and loaded when the reader comes near it.
    assert.match(content, /<h2[^>]*>On the equator<\/h2>\s*<img class="storymap-figure" src="\/charts\/equator\.webp" alt="The layer rises at dusk" loading="lazy">\s*<p>The drone circled here\.<\/p>/);
    assert.equal(content.match(/class="storymap-figure"/g).length, 1);

    const [view] = [...content.matchAll(/data-view="([^"]*)"/g)].map(([, json]) => JSON.parse(json.replace(/&quot;/g, '"')));

    assert.deepEqual(view, { zoom: 8, figure: '/charts/equator.webp', alt: 'The layer rises at dusk' });

    // Pictures take the place of the map, and figures go over it.
    await assert.rejects(
      markdownCompiler.compile(`::: storymap
## A picture {image="/photos/harbour.jpg"}

## A figure {figure="/charts/equator.webp"}
:::
`),
      /its steps have both an image and a figure/
    );
  });

  test('should start a storymap from the configured map settings', async function () {
    const configuration = Configuration.get();
    const previous = configuration.storymap;

    configuration.storymap = { style: '/map-styles/bathymetry.json', layout: 'floating' };

    try {
      const compiler = new MarkdownCompiler();
      await compiler.initialise();

      const [, content] = await compiler.compile(`::: storymap
\`\`\`yaml
layout: docked
\`\`\`

## A step {zoom=3}
:::
`);
      const settings = JSON.parse(content.match(/class="storymap-configuration">([\s\S]*?)<\/script>/)[1]);

      // The site's base map, and the storymap's own layout over the configured one.
      assert.equal(settings.style, '/map-styles/bathymetry.json');
      assert.equal(settings.layout, 'docked');
    } finally {
      configuration.storymap = previous;
    }
  });

  test('should read how a storymap step moves and what time it shows', async function () {
    const [, content] = await markdownCompiler.compile(`::: storymap
## A leg {from="2023-07-17" until="2023-09-12" duration=4000 speed=0.6}
:::
`);
    const [view] = [...content.matchAll(/data-view="([^"]*)"/g)].map(([, json]) => JSON.parse(json.replace(/&quot;/g, '"')));

    assert.deepEqual(view, { from: '2023-07-17', until: '2023-09-12', duration: 4000, speed: 0.6 });
  });

  test('should read the date that a storymap step shows dated layers for', async function () {
    const [, content] = await markdownCompiler.compile(`::: storymap
## A day {show="sst" date="2023-07-17"}
:::
`);
    const [view] = [...content.matchAll(/data-view="([^"]*)"/g)].map(([, json]) => JSON.parse(json.replace(/&quot;/g, '"')));

    assert.deepEqual(view, { show: ['sst'], date: '2023-07-17' });

    await assert.rejects(
      markdownCompiler.compile(`::: storymap
## A day {date="17 July"}
:::
`),
      /date="17 July" should be a date, such as 2023-07-17\./
    );
  });

  test('should check the markers of a storymap timeline', async function () {
    const compile = (marker) => markdownCompiler.compile(`::: storymap
\`\`\`yaml
timeline:
  layers: [tracks]
  marker: ${marker}
\`\`\`

## A step {zoom=3}
:::
`);

    await assert.rejects(compile('{ name: SD1030 }'), /unknown setting, name\. Use source, where, color, label or side\./);
    await assert.rejects(compile('[{ label: SD1030, side: west }]'), /side: west, of a marker of the timeline, isn't a side\. Use left, right, top or bottom\./);
    await assert.rejects(compile('[{ where: SD1030 }]'), /where, of a marker of the timeline, should be a set of properties/);
    await assert.rejects(compile('[3]'), /a marker of the timeline should be true, the id of a source, or its settings/);

    // One marker, the source that it follows, or several with their own settings.
    await compile('true');
    await compile('positions');

    const [, content] = await compile('[{ where: { drone: SD1030 }, label: SD1030, color: "#f2a541", side: left }, positions]');

    assert.match(content, /"marker":\[\{"where":\{"drone":"SD1030"\},"label":"SD1030","color":"#f2a541","side":"left"\},"positions"\]/);
  });

  test('should name a storymap move that has no speed', async function () {
    await assert.rejects(
      markdownCompiler.compile(`::: storymap
## A step {speed=0}
:::
`),
      /speed="0" should be more than 0\./
    );
  });

  test('should name a storymap projection or control that does not exist', async function () {
    const compile = (settings) => markdownCompiler.compile(`::: storymap
\`\`\`yaml
${settings}
\`\`\`

## A step {zoom=3}
:::
`);

    await assert.rejects(compile('projection: orthographic'), /projection: orthographic isn't a projection\. Use mercator or globe\./);
    await assert.rejects(compile('legend: { scale: logarithmic, stops: [[0.03, "#fff"], [0.3, "#000"]] }'), /scale: logarithmic, of a legend, isn't a scale\. Use linear or log\./);
    await assert.rejects(compile('controls: { ruler: true }'), /unknown control, ruler\. Use zoom, compass or scale\./);
    await assert.rejects(compile('controls: [zoom, scale]'), /controls should be a set of keys/);

    const [, content] = await compile('projection: globe\ncontrols: { compass: true, scale: nautical }');

    assert.match(content, /"projection":"globe","controls":\{"compass":true,"scale":"nautical"\}/);
  });

  test('should name an unknown storymap attribute', async function () {
    await assert.rejects(
      markdownCompiler.compile(`::: storymap
## A step {centre="1,2"}

Text
:::
`),
      /unknown attribute, centre/
    );
  });

  test('should name a storymap layout that does not exist', async function () {
    await assert.rejects(
      markdownCompiler.compile(`::: storymap
\`\`\`yaml
layout: overlay
\`\`\`

## A step {zoom=3}
:::
`),
      /layout: overlay isn't a layout\. Use docked or floating\./
    );
  });

  test('should render a playground with its settings and its text', async function () {
    const [, content] = await markdownCompiler.compile(`::: playground
\`\`\`yaml
files:
  postdoc.tgz: { url: /playground/postdoc.tgz }
  notes.md: { content: "# Notes" }
commands:
  - npm install ./postdoc.tgz
  - cd site && npx postdoc run
\`\`\`

Press Run to start Node.js in your browser.
:::
`);
    const settings = JSON.parse(content.match(/class="playground-configuration">([\s\S]*?)<\/script>/)[1]);

    assert.deepEqual(settings, {
      files: { 'postdoc.tgz': { url: '/playground/postdoc.tgz' }, 'notes.md': { content: '# Notes' } },
      commands: ['npm install ./postdoc.tgz', 'cd site && npx postdoc run'],
      open: []
    });
    assert.match(content, /<div class="playground-text"><p>Press Run to start Node\.js in your browser\.<\/p>\n<\/div>/);

    await assert.rejects(markdownCompiler.compile('::: playground\n```yaml\nfiles:\n  a.txt: hello\n```\n:::\n'), /the file a\.txt should be \{ url \} or \{ content \}/);
    await assert.rejects(markdownCompiler.compile('::: playground\n```yaml\nrun: [ls]\n```\n:::\n'), /run isn't a setting/);
  });

  test('should list the files of a tutorial folder and read the editor settings of a playground', async function () {
    // The site's public files (baseDir/public): a tutorial with a node_modules folder to leave out.
    await mkdir('postdoc/public/tutorials/first-page/src', { recursive: true });
    await mkdir('postdoc/public/tutorials/first-page/node_modules/x', { recursive: true });
    await writeFile('postdoc/public/tutorials/first-page/package.json', '{}', 'utf-8');
    await writeFile('postdoc/public/tutorials/first-page/src/index.md', '# Hello', 'utf-8');
    await writeFile('postdoc/public/tutorials/first-page/node_modules/x/index.js', '', 'utf-8');

    const [, content] = await markdownCompiler.compile(`::: playground
\`\`\`yaml
files: /tutorials/first-page
commands: [npm run dev]
open: src/index.md
preview: /index.html
directory: .
editor: true
logo: /assets/logo.svg
\`\`\`
:::
`);
    const settings = JSON.parse(content.match(/class="playground-configuration">([\s\S]*?)<\/script>/)[1]);

    assert.deepEqual(settings, {
      files: {
        'package.json': { url: '/tutorials/first-page/package.json' },
        'src/index.md': { url: '/tutorials/first-page/src/index.md' }
      },
      commands: ['npm run dev'],
      open: ['src/index.md'],
      preview: '/index.html',
      directory: '.',
      editor: true,
      logo: '/assets/logo.svg'
    });

    await assert.rejects(markdownCompiler.compile('::: playground\n```yaml\nfiles: /tutorials/none\n```\n:::\n'), /files: \/tutorials\/none isn't a folder of the site's public files/);
    await assert.rejects(markdownCompiler.compile('::: playground\n```yaml\nfiles: /../..\n```\n:::\n'), /isn't a folder of the site's public files/);
    await assert.rejects(markdownCompiler.compile('::: playground\n```yaml\nopen: 3\n```\n:::\n'), /open should be a file, or a list of files/);
    await assert.rejects(markdownCompiler.compile('::: playground\n```yaml\npreview: index.html\n```\n:::\n'), /preview should be true, false or the path of a page/);
    await assert.rejects(markdownCompiler.compile('::: playground\n```yaml\neditor: yes please\n```\n:::\n'), /editor should be true or false/);
    await assert.rejects(markdownCompiler.compile('::: playground\n```yaml\nlogo: 3\n```\n:::\n'), /logo should be the URL of a picture/);
  });

  test('should make the cells of a notebook from its python code blocks and the text between them', async function () {
    const [, content] = await markdownCompiler.compile(`::: notebook
\`\`\`yaml
title: A first look
packages: [pandas, { name: geopandas, deps: false }]
files:
  data/track.csv: { content: "time,speed" }
setup: import os
\`\`\`

Read the **track**:

\`\`\`python
import pandas as pd
pd.read_csv('data/track.csv')
\`\`\`

\`\`\`sh
pip install pandas
\`\`\`

\`\`\`py
print(1 < 2)
\`\`\`
:::
`);
    const settings = JSON.parse(content.match(/class="notebook-configuration">([\s\S]*?)<\/script>/)[1]);

    assert.deepEqual(settings, {
      title: 'A first look',
      packages: ['pandas', { name: 'geopandas', deps: false }],
      files: { 'data/track.csv': { content: 'time,speed' } },
      setup: 'import os',
      cells: [
        { type: 'markdown', source: 'Read the **track**:' },
        { type: 'code', source: 'import pandas as pd\npd.read_csv(\'data/track.csv\')' },
        { type: 'markdown', source: '```sh\npip install pandas\n```' },
        { type: 'code', source: 'print(1 < 2)' }
      ]
    });
    assert.match(content, /<div class="notebook-cell notebook-markdown" data-cell="0"><p>Read the <strong>track<\/strong>:<\/p>/);
    // The code is coloured from the notebook's own custom properties, not the site's.
    assert.match(content, /<div class="notebook-cell notebook-code" data-cell="1"><div class="notebook-input"><pre class="notebook-source" tabindex="0"><code>/);
    assert.match(content, /var\(--shiki-token-keyword\)/);
    assert.doesNotMatch(content, /<div class="notebook-input"><pre class="shiki/);
    assert.match(content, /<details class="notebook-setup"><summary>What runs before the cells<\/summary><p>Installs <code>pandas<\/code>, <code>geopandas<\/code>\.<\/p><p>Puts <code>data\/track\.csv<\/code> in the working directory\.<\/p>/);
    // A code block in another language stays text, coloured by the site.
    assert.match(content, /<div class="notebook-cell notebook-markdown" data-cell="2"><div class="language-sh">/);
  });

  test('should take the cells of a notebook and their outputs from a Jupyter notebook', async function () {
    await mkdir('postdoc/public/notebooks', { recursive: true });
    await writeFile('postdoc/public/notebooks/first.ipynb', JSON.stringify({
      nbformat: 4,
      cells: [
        { cell_type: 'markdown', source: ['# Speeds\n', 'Knots, *each hour*.'] },
        {
          cell_type: 'code',
          execution_count: 3,
          source: ['speeds = [3, 4]\n', 'speeds'],
          outputs: [
            { output_type: 'stream', name: 'stdout', text: ['loaded <2>\n'] },
            { output_type: 'execute_result', data: { 'text/plain': ['[3, 4]'] } },
            { output_type: 'display_data', data: { 'image/png': 'iVBORw0KGgo=\n', 'text/plain': 'Figure: Speed' } },
            { output_type: 'error', ename: 'NameError', evalue: 'x', traceback: ['\u001b[31mNameError\u001b[0m: x'] }
          ]
        },
        { cell_type: 'raw', source: 'left out' }
      ]
    }), 'utf-8');

    const [, content] = await markdownCompiler.compile('::: notebook\n```yaml\nsrc: /notebooks/first.ipynb\n```\n\nThe speeds of a day.\n:::\n');
    const settings = JSON.parse(content.match(/class="notebook-configuration">([\s\S]*?)<\/script>/)[1]);

    assert.deepEqual(settings.cells, [
      { type: 'markdown', source: '# Speeds\nKnots, *each hour*.' },
      { type: 'code', source: 'speeds = [3, 4]\nspeeds' }
    ]);
    assert.match(content, /<div class="notebook-text"><p>The speeds of a day\.<\/p>\n<\/div>/);
    assert.match(content, /<div class="notebook-cell notebook-markdown" data-cell="0"><h1 id="[^"]*">Speeds<\/h1>\n<p>Knots, <em>each hour<\/em>\.<\/p>/);
    assert.match(content, /<div class="notebook-cell notebook-code" data-cell="1" data-count="3">/);
    assert.match(content, /<pre class="notebook-stream">loaded &lt;2&gt;\n<\/pre>/);
    assert.match(content, /<pre class="notebook-text-output">\[3, 4\]<\/pre>/);
    assert.match(content, /<img class="notebook-image" src="data:image\/png;base64,iVBORw0KGgo=" alt="Figure: Speed">/);
    assert.match(content, /<pre class="notebook-error">NameError: x<\/pre>/);
    assert.doesNotMatch(content, /left out/);
  });

  test('should name what is wrong with the settings of a notebook', async function () {
    const notebook = (settings) => markdownCompiler.compile(`::: notebook\n\`\`\`yaml\n${settings}\n\`\`\`\n:::\n`);

    await assert.rejects(notebook('kernel: python'), /Notebook: kernel isn't a setting\. Use title, src, packages, files or setup\./);
    await assert.rejects(notebook('packages: pandas'), /packages should be a list of package names or wheel URLs/);
    await assert.rejects(notebook('packages: [{ name: pandas, version: 2 }]'), /\{"name":"pandas","version":2\} isn't a package/);
    await assert.rejects(notebook('src: /notebooks/none.ipynb'), /src: \/notebooks\/none\.ipynb isn't a notebook in the site's public files/);
    await assert.rejects(notebook('files: /none'), /files: \/none isn't a folder of the site's public files/);
    await assert.rejects(notebook('setup: 3'), /setup should be text/);
  });

  test('should link to the pages made from Markdown files', async function () {
    const [, content] = await markdownCompiler.compile(
      '[Docs](docs/index.md), [setup](../setup.md#node), [site](/guide/a.md?x=1), ' +
      '[GitHub](https://github.com/x/y/blob/main/README.md) and [notes](notes.mdx)'
    );

    assert.match(content, /href="docs\/index\.html"/);
    assert.match(content, /href="\.\.\/setup\.html#node"/);
    assert.match(content, /href="\/guide\/a\.html\?x=1"/);
    assert.match(content, /href="https:\/\/github\.com\/x\/y\/blob\/main\/README\.md"/);
    assert.match(content, /href="notes\.mdx"/);
  });
});
