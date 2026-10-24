import { CORE_SCHEMA, binaryTag, load, loadAll, mergeTag, omapTag, pairsTag, setTag, timestampTag } from 'js-yaml';

// The schema js-yaml 4 loaded with by default: YAML 1.2's core schema, plus dates, merge
// keys and the other YAML 1.1 types, which js-yaml 5 leaves out.
const SCHEMA = CORE_SCHEMA.withTags(timestampTag, mergeTag, binaryTag, omapTag, pairsTag, setTag);

// js-yaml 5 throws on YAML with nothing but spaces and comments in it, which js-yaml 4
// loaded as undefined.
export function loadYaml(source) {
  return loadAll(source, { schema: SCHEMA }).length ? load(source, { schema: SCHEMA }) : undefined;
}

// The YAML between a `---` (or `= yaml =`) line at the start of a file and the next `---`
// (or `...`) line, as the front-matter package read it.
const FRONT_MATTER_RE = /^(\ufeff?(= yaml =|---)$([\s\S]*?)^(?:\2|\.\.\.)\s*$\r?(?:\n)?)/m;

export function parseFrontMatter(source) {
  const match = /= yaml =|---/.test(source.split(/\r?\n/, 1)[0]) && FRONT_MATTER_RE.exec(source);

  if (!match) {
    return { attributes: {}, body: source };
  }

  return {
    attributes: loadYaml(match[3].trim()) || {},
    body: source.replace(match[0], '')
  };
}
