import { spawn, spawnSync } from 'child_process';
import { rmSync } from 'fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { chdir } from 'process';
import kill from 'tree-kill';

describe('Test api page', function () {
  const rootDirectory = process.cwd();
  const pathToPostdoc = resolve(rootDirectory, 'bin/postdoc.js');
  const apiPagesFolder = 'api-pages';

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

    const postdocConfigFilename = 'postdoc.config.js';
    let postdocConfigContent = await readFile(postdocConfigFilename, 'utf8');
    postdocConfigContent = postdocConfigContent.replace(/\bsource: null\b/, `source: './${apiPagesFolder}'`);
    await writeFile(postdocConfigFilename, postdocConfigContent);

    // The source folder exists before the server starts, as in a project.
    await mkdir(apiPagesFolder);
    await writeFile(join(apiPagesFolder, 'boo.js'), `
/**
 * Function to add two numbers
 * @param {number} a
 * @param {number} b
 */
function sum(a, b){
  return a + b;
}

/**
* Function to subtract two numbers
* @param {number} a
* @param {number} b
*/
function diff(a, b){
  return a - b;
}
    `);
    await writeFile(join(apiPagesFolder, 'package.json'), JSON.stringify({
      name: apiPagesFolder,
      version: '1.0.0',
      main: 'index.js'
    }, null, 2));

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

  it('Check if api-page has proper comments', async function(browser) {
    browser
      .navigateTo(`${serverUrl}/boo.html`)
      .waitForElementVisible('body');

    browser.element.findByText('sum').assert.visible();
    browser.element.findByText('Function to add two numbers').assert.visible();
    browser.element.findByText('diff').assert.visible();
    browser.element.findByText('Function to subtract two numbers').assert.visible();
  });
});
