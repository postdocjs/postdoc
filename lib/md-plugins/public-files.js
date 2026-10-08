/**
 * The files that a playground or a notebook starts with, from its settings: a folder
 * of the site's public files by its URL, every file in it listed when the page is
 * compiled (`node_modules` and `.git` are left out), or a map from each path to
 * `{ url }`, a file of the site, or `{ content }`, text written in the settings.
 */

import { readdirSync, statSync } from 'node:fs';
import { join, posix, relative, resolve, sep } from 'node:path';

// Folders that a project's files are listed without.
const LEFT_OUT = ['node_modules', '.git'];

// The path on disk of a URL of the site's public files, or null when it is outside them.
export function resolvePublicPath(url, publicDirectory) {
  if (!publicDirectory) {
    return null;
  }

  const path = resolve(publicDirectory, `.${posix.normalize(`/${url}`)}`);

  return path.startsWith(resolve(publicDirectory) + sep) ? path : null;
}

function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

// Every file of a folder of the site's public files, as the paths in the folder mapped
// to the URLs to fetch them from.
function listFolder(url, publicDirectory, fail) {
  const folder = resolvePublicPath(url, publicDirectory);

  if (!folder || !isDirectory(folder)) {
    fail(`files: ${url} isn't a folder of the site's public files.`);
  }

  const files = {};

  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (LEFT_OUT.includes(entry.name)) {
        continue;
      }

      const path = join(directory, entry.name);

      if (entry.isDirectory()) {
        walk(path);
      } else if (entry.isFile()) {
        const filePath = relative(folder, path).split(sep).join('/');

        files[filePath] = { url: posix.join('/', url, filePath) };
      }
    }
  };

  walk(folder);

  return files;
}

// The files of the settings, checked, as a map from each path to { url } or { content }.
// fail is called with a message when they aren't right.
export function readFiles(files, publicDirectory, fail) {
  if (typeof files === 'string') {
    files = listFolder(files, publicDirectory, fail);
  }

  if (typeof files !== 'object' || files === null || Array.isArray(files)) {
    fail('files should be the URL of a folder of the site, or map each path to { url } or { content }.');
  }

  for (const [path, file] of Object.entries(files)) {
    if (typeof file !== 'object' || file === null || (typeof file.url !== 'string') === (typeof file.content !== 'string')) {
      fail(`the file ${path} should be { url } or { content }.`);
    }
  }

  return files;
}
