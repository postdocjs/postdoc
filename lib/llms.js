/**
 * Pages for AI agents: an llms.txt at the root of the site, which lists its pages, and a
 * Markdown copy of every page beside its HTML. See https://llmstxt.org.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

import Configuration from './configuration.js';
import { prefixBase } from './html-urls.js';
import { parseFrontMatter } from './utils/yaml.js';

const HEADING_RE = /^#\s+(.+?)\s*#*\s*$/m;

const toMarkdownUrl = (url) => url.replace(/\.html$/, '.md');

/**
 * The Markdown copy of a page: its source without the front matter, under its title.
 * Returns null for a draft, which builds leave out.
 *
 * @ignore
 */
export function createMarkdownCopy(source, url) {
  const { attributes, body } = parseFrontMatter(source);

  if (attributes.draft) {
    return null;
  }

  const heading = HEADING_RE.exec(body)?.[1];
  const title = attributes.title ?? heading ?? url;
  const text = body.trim();

  return {
    url,
    title,
    description: attributes.description ?? null,
    markdown: (attributes.title && !heading ? `# ${attributes.title}\n\n${text}` : text) + '\n'
  };
}

/**
 * The llms.txt of a site: its name, a line about it and its pages, in a section for
 * each folder at the top of the site.
 *
 * @ignore
 */
export function createLlmsText({ name, description, pages, base = '/' }) {
  const addBase = prefixBase(base);
  const sections = new Map();

  for (const page of [...pages].sort((a, b) => a.url.localeCompare(b.url))) {
    const folder = page.url.split('/').length > 2 ? page.url.split('/')[1] : '';
    const title = folder ? folder.charAt(0).toUpperCase() + folder.slice(1).replaceAll('-', ' ') : 'Pages';

    sections.set(title, [...(sections.get(title) ?? []), page]);
  }

  const lines = [`# ${name || 'Site'}`, ''];

  if (description) {
    lines.push(`> ${description}`, '');
  }

  for (const [title, sectionPages] of sections) {
    lines.push(`## ${title}`, '');

    for (const page of sectionPages) {
      const link = addBase(toMarkdownUrl(page.url)) ?? toMarkdownUrl(page.url);

      lines.push(`- [${page.title}](${link})${page.description ? `: ${page.description}` : ''}`);
    }

    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Writes llms.txt and the Markdown copies of the pages into the output directory, for
 * the pages that the build wrote. `pages` are the pages made from Markdown.
 *
 * @ignore
 */
export async function writeLlmsFiles(pages, outputDirectory) {
  const configuration = Configuration.get();
  const copies = [];

  for (const page of pages) {
    // A page that couldn't be compiled has no HTML, and gets no copy.
    if (!existsSync(join(outputDirectory, ...page.url.split('/')))) {
      continue;
    }

    const copy = createMarkdownCopy(await readFile(page.sourceFilePath, 'utf8'), page.url);

    if (copy) {
      const filePath = join(outputDirectory, ...toMarkdownUrl(page.url).split('/'));

      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, copy.markdown, 'utf8');
      copies.push(copy);
    }
  }

  await writeFile(join(outputDirectory, 'llms.txt'), createLlmsText({
    name: configuration.appSettings?.name,
    description: configuration.llms.description ?? configuration.appSettings?.description,
    pages: copies,
    base: configuration.base
  }), 'utf8');

  return copies.length;
}
