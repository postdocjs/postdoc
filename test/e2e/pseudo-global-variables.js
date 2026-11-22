import { rmSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, basename } from 'node:path';
import { chdir } from 'node:process';
import kill from 'tree-kill';

describe('Test pseudo global variables in ejs files', function () {
  const rootDirectory = process.cwd();
  const pathToPostdoc = resolve(rootDirectory, 'bin/postdoc.js');

  // The template keeps its layouts in src/layouts and its pages in content.
  const layoutPath = join('src', 'layouts', 'globals.ejs');
  const contentPath = join('content', 'globals.md');

  let tmpDir;
  let commandProcess;
  let serverUrl;

  before(async function (browser, done) {
    tmpDir = await mkdtemp(join(tmpdir(), '.foo'));
    chdir(tmpDir);

    spawnSync('node', [pathToPostdoc, 'init', '--name', '.']);

    const filename = 'package.json';
    const fileContent = await readFile(filename, 'utf8');
    const finalContent = fileContent.replace(
      /"postdoc":\s*"(.*?)"/g,
      `"postdoc": "file:${rootDirectory.replaceAll('\\', '/')}"`
    );
    await writeFile(filename, finalContent);

    await mkdir(join('src', 'js'), { recursive: true });
    await writeFile(
      join('src', 'js', 'test-require.cjs'),
      `
module.exports = { text: "some text" };
`
    );

    await writeFile(
      join('src', 'js', 'test-import.js'),
      `
export const text = 'some text'
`
    );

    await writeFile(
      layoutPath,
      `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=5.0, minimum-scale=0.86"
        />
        <title><%= appSettings.name %></title>
      </head>
      <body>
        <span id="filename"><%= __filename %></span>
        <span id="dirname"><%= __dirname %></span>

        <% const testRequire = require('../js/test-require.cjs'); %>
        <span id="test-require"><%= testRequire.text %></span>

        <% const testImport = await importModule('../js/test-import.js'); %>
        <span id="test-import"><%= testImport.text %></span>

        <span id="page-url"><%= page.url %></span>

        <span id="page-content"><%- page.content %></span>
      </body>
    </html>
    `
    );

    await writeFile(contentPath, `
# What is {{appSettings.name}}

## Part 1

Lorem ipsum dolor sit amet, consectetur adipiscing elit.

## Part 2

Lorem ipsum dolor sit amet, consectetur adipiscing elit.
    `);

    spawnSync('npm', ['install'], { shell: true });

    commandProcess = await new Promise((resolve, reject) => {
      const childProcess = spawn('npm', ['start'], {
        cwd: tmpDir,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let output = '';
      childProcess.stdout.on('data', (chunk) => {
        output += chunk.toString();

        // Vite moves to another port when 5173 is taken.
        const url = output.match(/https?:\/\/[^\s/]+/);
        if (url) {
          serverUrl = url[0];
          resolve(childProcess);
        }
      });

      childProcess.on('exit', reject);
    });

    done();
  });

  after(function (browser, done) {
    kill(commandProcess.pid, 'SIGTERM', function () {
      chdir(rootDirectory);
      rmSync(tmpDir, { recursive: true });
      done();
    });
  });

  it('check if pseudo-global variables are available in ejs files', async function (browser) {
    const absolutePathToFilenameInsideLayoutsFolder = resolve(layoutPath);

    browser
      .navigateTo(`${serverUrl}/globals.html`)
      .waitForElementVisible('body')
      .assert.textEquals('#filename', absolutePathToFilenameInsideLayoutsFolder)
      .assert.textEquals('#dirname', dirname(absolutePathToFilenameInsideLayoutsFolder))
      .assert.textEquals('#test-require', 'some text')
      .assert.textEquals('#test-import', 'some text')
      .assert.textEquals('#page-url', '/globals.html')
      .assert.textContains('#page-content', `What is ${basename(tmpDir)}`);
  });
});
