import assert from 'node:assert/strict';

import { createLlmsText, createMarkdownCopy } from '../../lib/llms.js';

describe('llms.txt', function () {
  it('should copy a page without its front matter, under its title', function () {
    const copy = createMarkdownCopy('---\ntitle: Install\ndescription: How to install it.\n---\n\nRun `npm i`.\n', '/guide/install.html');

    assert.deepEqual(copy, {
      url: '/guide/install.html',
      title: 'Install',
      description: 'How to install it.',
      markdown: '# Install\n\nRun `npm i`.\n'
    });
  });

  it('should keep a page\'s own heading, and leave drafts out', function () {
    assert.equal(createMarkdownCopy('# Home\n\nWelcome.', '/index.html').markdown, '# Home\n\nWelcome.\n');
    assert.equal(createMarkdownCopy('# Home', '/index.html').title, 'Home');
    assert.equal(createMarkdownCopy('---\ndraft: true\n---\nSoon.', '/soon.html'), null);
  });

  it('should list the pages by folder, with the base path', function () {
    const text = createLlmsText({
      name: 'Acme',
      description: 'Docs for Acme.',
      base: '/docs/',
      pages: [
        { url: '/guide/install.html', title: 'Install', description: 'How to install it.' },
        { url: '/index.html', title: 'Home', description: null },
        { url: '/guide/index.html', title: 'Guide', description: null }
      ]
    });

    assert.equal(text, [
      '# Acme',
      '',
      '> Docs for Acme.',
      '',
      '## Guide',
      '',
      '- [Guide](/docs/guide/index.md)',
      '- [Install](/docs/guide/install.md): How to install it.',
      '',
      '## Pages',
      '',
      '- [Home](/docs/index.md)',
      ''
    ].join('\n'));
  });
});
