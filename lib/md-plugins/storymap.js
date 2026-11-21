/**
 * Storymaps: a story told in steps beside a map that stays in view and moves to each
 * step as the reader scrolls.
 *
 * ````md
 * ::: storymap
 * ```yaml
 * style: https://tiles.openfreemap.org/styles/positron
 * sources:
 *   track:
 *     type: geojson
 *     data: /data/track.geojson
 * layers:
 *   - { id: track, type: line, source: track }
 * ```
 *
 * ## Leaving port {center="-157.86,21.3" zoom=9}
 *
 * The text of the step.
 * :::
 * ````
 *
 * Each heading of the first heading level in the container starts a step, and the
 * attributes in braces after it say what the map shows. The steps render as ordinary
 * content, so the story reads as a page without the map. The client in
 * client/storymap draws the map.
 *
 * A storymap can show pictures in place of the map. A step names its picture with the
 * image attribute, and its text alternative with alt:
 *
 * ```md
 * ## Leaving port {image="/photos/harbour.jpg" alt="A ship at the quay"}
 * ```
 *
 * The picture is rendered in the step, after its heading, so it's there without the
 * client too.
 *
 * A storymap with a map can show a picture over it, beside the step that it goes with,
 * such as a chart of what was measured there. That step names it with the figure
 * attribute:
 *
 * ```md
 * ## On the equator {center="-153.5,0" zoom=8 figure="/charts/equator.webp" alt="..."}
 * ```
 *
 * The `storymap` section of the configuration holds the settings every storymap starts
 * with, such as the base map. A storymap's own settings replace them key by key.
 *
 * Besides MapLibre's style, sources and layers, the settings can have a timeline, the
 * layers that the `from` and `until` of a step apply to, with its markers, a projection,
 * the controls of the map, legends, popups, and other options of the map. A source with
 * {date} in its address is shown for the date of each step. The client reads them.
 */

import { loadYaml } from '../utils/yaml.js';

// Docked: the steps beside the map, or above it on a narrow page. Floating: the map fills
// the storymap, and the steps scroll over it.
const LAYOUTS = ['docked', 'floating'];
const PROJECTIONS = ['mercator', 'globe'];
const CONTROLS = ['zoom', 'compass', 'scale', 'expand'];
const MARKER_SETTINGS = ['source', 'where', 'color', 'label', 'side'];
const MARKER_SIDES = ['left', 'right', 'top', 'bottom'];
const LEGEND_SCALES = ['linear', 'log'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ATTRIBUTE_RE = /([\w-]+)=(?:"([^"]*)"|'([^']*)'|(\S+))/g;
const HEADING_RE = /^(#{1,6})[ \t]+(.*?)(?:[ \t]+\{([^}]*)\})?[ \t]*$/;

function fail(message) {
  throw new Error(`Storymap: ${message}`);
}

function parseNumbers(value, count, name) {
  const numbers = value.split(',').map((part) => Number(part.trim()));

  if (numbers.length !== count || numbers.some((number) => !Number.isFinite(number))) {
    fail(`${name}="${value}" should be ${count} numbers separated by commas.`);
  }

  return numbers;
}

function parseNumber(value, name) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    fail(`${name}="${value}" should be a number.`);
  }

  return number;
}

const parseList = (value) => value.split(',').map((part) => part.trim()).filter(Boolean);

// What a step's attributes say the map shows.
function parseView(attributes, heading) {
  const view = {};

  for (const [, name, doubleQuoted, singleQuoted, bare] of attributes.matchAll(ATTRIBUTE_RE)) {
    const value = doubleQuoted ?? singleQuoted ?? bare;

    switch (name) {
      case 'center':
        view.center = parseNumbers(value, 2, name);
        break;
      case 'bounds':
        view.bounds = parseNumbers(value, 4, name);
        break;
      case 'zoom':
      case 'bearing':
      case 'pitch':
        view[name] = parseNumber(value, name);
        break;
      case 'duration':
      case 'speed':
        view[name] = parseNumber(value, name);

        // A move can take no time at all, but it can't have no speed.
        if (view[name] < 0 || (name === 'speed' && view[name] === 0)) {
          fail(`${name}="${value}" should be ${name === 'speed' ? 'more than 0' : '0 or more'}.`);
        }

        break;
      case 'show':
      case 'hide':
        view[name] = parseList(value);
        break;
      case 'date':
        if (!DATE_RE.test(value)) {
          fail(`date="${value}" should be a date, such as 2023-07-17.`);
        }

        view.date = value;
        break;
      case 'from':
      case 'until':
      case 'image':
      case 'figure':
      case 'alt':
        view[name] = value;
        break;
      default:
        fail(`the step "${heading}" has an unknown attribute, ${name}. Use center, zoom, bearing, ` +
          'pitch, bounds, duration, speed, show, hide, from, until, date, image, figure or alt.');
    }
  }

  return view;
}

const list = (names) => names.join(', ').replace(/, (\w+)$/, ' or $1');

// A timeline's marker is true, the id of the source that it follows, or its settings.
function checkMarker(marker) {
  if (typeof marker === 'boolean' || typeof marker === 'string') {
    return;
  }

  if (typeof marker !== 'object' || marker === null || Array.isArray(marker)) {
    fail('a marker of the timeline should be true, the id of a source, or its settings, such as label and color.');
  }

  for (const name of Object.keys(marker)) {
    if (!MARKER_SETTINGS.includes(name)) {
      fail(`a marker of the timeline has an unknown setting, ${name}. Use ${list(MARKER_SETTINGS)}.`);
    }
  }

  if (marker.where !== undefined && (typeof marker.where !== 'object' || marker.where === null || Array.isArray(marker.where))) {
    fail('where, of a marker of the timeline, should be a set of properties and their values, such as vessel: SD1030.');
  }

  if (marker.side !== undefined && !MARKER_SIDES.includes(marker.side)) {
    fail(`side: ${marker.side}, of a marker of the timeline, isn't a side. Use ${list(MARKER_SIDES)}.`);
  }
}

// The map settings: a YAML or JSON code block at the start of the container, over the
// settings every storymap of the site starts with.
function parseConfiguration(source, defaults) {
  const match = /^\s*```(?:ya?ml|json)[ \t]*\n([\s\S]*?)\n```[ \t]*(?:\n|$)/.exec(source);
  let own = {};

  if (match) {
    try {
      own = loadYaml(match[1]) ?? {};
    } catch (error) {
      fail(`the map settings aren't valid YAML: ${error.message}`);
    }

    if (typeof own !== 'object' || Array.isArray(own)) {
      fail('the map settings should be a set of keys, such as style, sources and layers.');
    }
  }

  const configuration = { ...defaults, ...own };

  if (configuration.layout !== undefined && !LAYOUTS.includes(configuration.layout)) {
    fail(`layout: ${configuration.layout} isn't a layout. Use ${LAYOUTS.join(' or ')}.`);
  }

  if (configuration.projection !== undefined && !PROJECTIONS.includes(configuration.projection)) {
    fail(`projection: ${configuration.projection} isn't a projection. Use ${PROJECTIONS.join(' or ')}.`);
  }

  const { controls = {} } = configuration;

  if (typeof controls !== 'object' || Array.isArray(controls)) {
    fail('controls should be a set of keys, such as compass: true and scale: nautical.');
  }

  for (const name of Object.keys(controls)) {
    if (!CONTROLS.includes(name)) {
      fail(`controls has an unknown control, ${name}. Use ${list(CONTROLS)}.`);
    }
  }

  [configuration.timeline?.marker ?? []].flat().forEach(checkMarker);

  for (const legend of [configuration.legend ?? []].flat()) {
    if (legend?.scale !== undefined && !LEGEND_SCALES.includes(legend.scale)) {
      fail(`scale: ${legend.scale}, of a legend, isn't a scale. Use ${list(LEGEND_SCALES)}.`);
    }
  }

  return { configuration, rest: match ? source.slice(match[0].length) : source };
}

// Splits the container into steps at the headings of the first heading level.
function splitSteps(source) {
  const steps = [];
  let level = null;
  let insideCode = false;

  for (const line of source.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      insideCode = !insideCode;
    }

    const heading = insideCode ? null : HEADING_RE.exec(line);

    if (heading && (level === null || heading[1].length === level)) {
      level = heading[1].length;
      steps.push({ view: parseView(heading[3] ?? '', heading[2]), lines: [`${heading[1]} ${heading[2]}`] });
    } else if (steps.length) {
      steps.at(-1).lines.push(line);
    } else if (line.trim()) {
      // Text before the first heading is a step that shows the starting view.
      steps.push({ view: {}, lines: [line] });
    }
  }

  return steps;
}

const escapeAttribute = (value) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// `defaults` is the configuration's storymap section: the settings every storymap of the
// site starts with.
export const storymapExtension = (defaults = {}) => ({
  extensions: [{
    name: 'storymap',
    level: 'block',
    start(src) {
      return src.match(/^:{3,} storymap/m)?.index;
    },

    // The container closes with as many colons as it opened with. Four colons let
    // steps contain other ::: containers.
    tokenizer(src) {
      const match = /^(:{3,}) storymap[ \t]*\n([\s\S]*?)\n\1(?!:)[ \t]*(?:\n|$)/.exec(src);

      if (!match) {
        return;
      }

      const { configuration, rest } = parseConfiguration(match[2], defaults);
      const steps = splitSteps(rest);

      if (!steps.length) {
        fail('it has no steps. Start each step with a heading.');
      }

      // Pictures take the place of the map, and figures go over it.
      if (steps.some((step) => step.view.image) && steps.some((step) => step.view.figure)) {
        fail('its steps have both an image and a figure. Use image for pictures in place of the map, or figure for pictures over it.');
      }

      return {
        type: 'storymap',
        raw: match[0],
        configuration,
        tokens: steps.map((step) => ({
          type: 'storymapStep',
          raw: step.lines.join('\n'),
          view: step.view,
          tokens: this.lexer.blockTokens(step.lines.join('\n'), [])
        }))
      };
    },

    renderer(token) {
      // In a script element, "</script>" in a value would end it early.
      const configuration = JSON.stringify(token.configuration).replace(/</g, '\\u003c');

      return '<div class="storymap">' +
        `<script type="application/json" class="storymap-configuration">${configuration}</script>` +
        '<div class="storymap-body">' +
        '<div class="storymap-map" hidden></div>' +
        `<div class="storymap-steps">${this.parser.parse(token.tokens)}</div>` +
        '</div>' +
        '</div>\n';
    }
  }, {
    name: 'storymapStep',
    renderer(token) {
      const { image, figure, alt = '' } = token.view;
      // A step's picture comes after the first block of the step, its heading. A figure
      // is loaded when the reader comes near its step.
      const [first, ...rest] = token.tokens;
      const picture = image
        ? `<img class="storymap-image" src="${escapeAttribute(image)}" alt="${escapeAttribute(alt)}">`
        : figure && `<img class="storymap-figure" src="${escapeAttribute(figure)}" alt="${escapeAttribute(alt)}" loading="lazy">`;
      const content = picture
        ? `${this.parser.parse([first])}${picture}${this.parser.parse(rest)}`
        : this.parser.parse(token.tokens);

      return `<section class="storymap-step" data-view="${escapeAttribute(JSON.stringify(token.view))}">${content}</section>`;
    }
  }],

  async: false
});
