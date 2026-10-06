import assert from 'node:assert/strict';

import { mapCssUrls, mapHtmlUrls, prefixBase } from '../../lib/html-urls.js';

describe('URLs in HTML and CSS', function () {
  const addBase = prefixBase('/docs/');

  it('should add the base path to URLs in markup', function () {
    const html = [
      '<a href="/guide/index.html#install">Guide</a>',
      '<link rel="stylesheet" href="/css/site.css">',
      '<script type="module" src="/js/site.js"></script>',
      '<img src="/logo.png" srcset="/logo.png 1x, /logo@2x.png 2x" alt="">',
      '<div style="background-image: url(\'/bg.svg\')"></div>',
      '<style>@import "/css/extra.css"; .hero { background: url(/hero.svg); }</style>'
    ].join('\n');

    assert.equal(mapHtmlUrls(html, addBase), [
      '<a href="/docs/guide/index.html#install">Guide</a>',
      '<link rel="stylesheet" href="/docs/css/site.css">',
      '<script type="module" src="/docs/js/site.js"></script>',
      '<img src="/docs/logo.png" srcset="/docs/logo.png 1x, /docs/logo@2x.png 2x" alt="">',
      '<div style="background-image: url(\'/docs/bg.svg\')"></div>',
      '<style>@import "/docs/css/extra.css"; .hero { background: url(/docs/hero.svg); }</style>'
    ].join('\n'));
  });

  it('should leave text, code, script bodies and comments alone', function () {
    const html = [
      '<p>Pages live at /guide/index.html.</p>',
      '<pre><code>&lt;a href="/guide/"&gt;</code></pre>',
      '<script>const url = "/guide/index.html";</script>',
      '<!-- <a href="/old/"> -->',
      '<a title="a > b" href="/guide/">Guide</a>'
    ].join('\n');

    assert.equal(mapHtmlUrls(html, addBase), html.replace('href="/guide/">Guide', 'href="/docs/guide/">Guide'));
  });

  it('should leave URLs that are not root-relative or already have the base path', function () {
    const html = '<a href="https://example.com/">x</a><a href="//cdn.example.com/x.js">x</a>' +
      '<a href="install.html">x</a><a href="#top">x</a><a href="/docs/guide/">x</a>';

    assert.equal(mapHtmlUrls(html, addBase), html);
  });

  it('should add the base path to URLs in stylesheets', function () {
    const css = '@font-face { src: url("/fonts/a.woff2"); } .a { background: url(/docs/b.svg); } .c { background: url(data:image/png;base64,AA); }';

    assert.equal(
      mapCssUrls(css, addBase),
      '@font-face { src: url("/docs/fonts/a.woff2"); } .a { background: url(/docs/b.svg); } .c { background: url(data:image/png;base64,AA); }'
    );
  });

  it('should tell the callback which tag and attribute a URL is in', function () {
    const seen = [];

    mapHtmlUrls('<a href="/a">a</a><img src="/b.png" alt=""><p style="background: url(/c.svg)">c</p>', (url, { tagName, attribute }) => {
      seen.push(`${tagName} ${attribute} ${url}`);
    });

    assert.deepEqual(seen, ['a href /a', 'img src /b.png', 'p style /c.svg']);
  });
});
