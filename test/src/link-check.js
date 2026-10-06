import assert from 'node:assert/strict';

import { checkLinks, collectIds } from '../../lib/link-check.js';

describe('Link check', function () {
  const pages = new Map([
    ['/index.html', '<a href="/guide/">Guide</a><a href="/guide/install.html#postdoc-requirements">Requirements</a>'],
    ['/guide/index.html', '<h2 id="postdoc-overview">Overview</h2><a href="install.html">Install</a><a href="#postdoc-overview">Up</a>'],
    ['/guide/install.html', '<h2 id="postdoc-requirements">Requirements</h2><img src="/logo.png" alt="">']
  ]);
  const files = new Set(['/logo.png', '/files/manual.pdf']);
  const fileExists = (path) => files.has(path);

  it('should accept links to pages, folders, ids and files of the site', function () {
    const { problems, linkCount } = checkLinks(pages, { fileExists });

    assert.deepEqual(problems, []);
    assert.equal(linkCount, 5);
  });

  it('should report links to pages that do not exist', function () {
    const { problems } = checkLinks(new Map([...pages, ['/about.html', '<a href="/guide/setup.html">Setup</a>']]), { fileExists });

    assert.deepEqual(problems, [{
      page: '/about.html',
      url: '/guide/setup.html',
      message: 'links to /guide/setup.html, which isn\'t a page of the site'
    }]);
  });

  it('should report links to ids that the page does not have', function () {
    const { problems } = checkLinks(new Map([
      ['/a.html', '<a href="/b.html#postdoc-missing">B</a><a href="#nowhere">Here</a>'],
      ['/b.html', '<h2 id="postdoc-there">There</h2>']
    ]));

    assert.deepEqual(problems.map(({ message }) => message), [
      'links to /b.html#postdoc-missing, but /b.html has no element with the id "postdoc-missing"',
      'links to #nowhere, but the page has no element with that id'
    ]);
  });

  it('should report pictures that are not files of the site', function () {
    const { problems } = checkLinks(new Map([['/a.html', '<img src="/missing.png" alt=""><img src="/logo.png" alt="">']]), { fileExists });

    assert.deepEqual(problems.map(({ message }) => message), ['shows /missing.png, which isn\'t a file of the site']);
  });

  it('should leave other sites, mail and empty fragments alone', function () {
    const { problems, linkCount } = checkLinks(new Map([[
      '/a.html',
      '<a href="https://example.com/x.html">x</a><a href="mailto:a@example.com">a</a><a href="#">top</a><a href="//cdn.example.com/x">x</a>'
    ]]));

    assert.deepEqual(problems, []);
    assert.equal(linkCount, 0);
  });

  it('should take pages without their .html, and links with the base path', function () {
    const { problems } = checkLinks(new Map([
      ['/a.html', '<a href="/b">B</a><a href="/docs/b.html">B</a>'],
      ['/b.html', '']
    ]), { base: '/docs/' });

    assert.deepEqual(problems, []);
  });

  it('should collect the ids of a page, but not text that looks like one', function () {
    const ids = collectIds('<h2 id="postdoc-a">A</h2><a name="b"></a><pre>&lt;div id="c"&gt;</pre><script type="application/json">{"id":"d"}</script>');

    assert.deepEqual([...ids], ['postdoc-a', 'b']);
  });
});
