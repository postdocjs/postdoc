import assert from 'node:assert/strict';

import { loadYaml, parseFrontMatter } from '../../lib/utils/yaml.js';

describe('YAML', function () {
  test('should load nothing from YAML with nothing but spaces and comments in it', function () {
    assert.equal(loadYaml(''), undefined);
    assert.equal(loadYaml('  \n'), undefined);
    assert.equal(loadYaml('# A comment'), undefined);
  });

  test('should load dates and merge keys, as js-yaml 4 did', function () {
    const value = loadYaml('date: 2024-05-01\nbase: &base { x: 1 }\nmerged:\n  <<: *base\n  y: 2\nanswer: yes');

    assert.equal(value.date instanceof Date, true);
    assert.equal(value.date.toISOString(), '2024-05-01T00:00:00.000Z');
    assert.deepEqual(value.merged, { x: 1, y: 2 });
    assert.equal(value.answer, 'yes');
  });

  test('should not load YAML with more than one document', function () {
    assert.throws(() => loadYaml('a: 1\n---\nb: 2'), /single document/);
  });

  test('should take the front matter from the start of a page', function () {
    assert.deepEqual(parseFrontMatter('---\ntitle: A\n---\n\n# A\n'), { attributes: { title: 'A' }, body: '# A\n' });
    assert.deepEqual(parseFrontMatter('﻿---\ntitle: A\n---\nbody'), { attributes: { title: 'A' }, body: 'body' });
    assert.deepEqual(parseFrontMatter('---\r\ntitle: A\r\n---\r\nbody'), { attributes: { title: 'A' }, body: 'body' });
    assert.deepEqual(parseFrontMatter('---\ntitle: A\n...\nbody'), { attributes: { title: 'A' }, body: 'body' });
  });

  test('should read front matter with nothing in it as no attributes', function () {
    assert.deepEqual(parseFrontMatter('---\n# Only a comment\n---\nbody'), { attributes: {}, body: 'body' });
  });

  test('should leave a page without front matter as it is', function () {
    assert.deepEqual(parseFrontMatter('# A page\n'), { attributes: {}, body: '# A page\n' });
    assert.deepEqual(parseFrontMatter('Intro\n\n---\n\nmore\n---\n'), { attributes: {}, body: 'Intro\n\n---\n\nmore\n---\n' });
  });
});
