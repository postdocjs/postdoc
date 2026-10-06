/**
 * What a storymap puts over its map besides the steps: the map's controls, the legends
 * of its layers, the figures of its steps, and popups with the properties of the feature
 * under the pointer.
 */

const SCALE_UNITS = ['metric', 'imperial', 'nautical'];
// Below this zoom a globe shows so much of the Earth that no one length is right
// across it.
const GLOBE_SCALE_ZOOM = 3;
// Pixels around the pointer that a popup looks for a feature in, so a thin line is easy
// to point at.
const POPUP_REACH = 4;

/**
 * Adds the controls that the settings ask for. The zoom buttons are there unless they
 * turn them off. The compass shows where north is on a map that the steps turn or tilt,
 * and puts it back. The scale is in kilometres, or in the unit that it names.
 *
 * @ignore
 */
export function addControls(map, maplibregl, { controls = {}, projection }) {
  const { zoom = true, compass = false, scale = false } = controls;

  if (zoom || compass) {
    map.addControl(new maplibregl.NavigationControl({
      showZoom: Boolean(zoom),
      showCompass: Boolean(compass),
      visualizePitch: true
    }), 'top-right');
  }

  if (scale) {
    map.addControl(new maplibregl.ScaleControl({ unit: SCALE_UNITS.includes(scale) ? scale : 'metric', maxWidth: 120 }), 'bottom-left');

    if (projection === 'globe') {
      const element = map.getContainer().querySelector('.maplibregl-ctrl-scale');
      const showScale = () => {
        element.hidden = map.getZoom() < GLOBE_SCALE_ZOOM;
      };

      map.on('move', showScale);
      showScale();
    }
  }
}

const createElement = (className, textContent = '') => Object.assign(document.createElement('div'), { className, textContent });

// A legend explains the colours of a layer: a ramp between its `stops`, each a value and
// its colour, or a list of `items`, each a label and its colour.
function createLegend({ title, stops = [], items = [], scale }) {
  const legend = createElement('storymap-legend');

  if (title) {
    legend.append(createElement('storymap-legend-title', title));
  }

  if (stops.length > 1) {
    const [first] = stops[0];
    const [last] = stops.at(-1);
    const ramp = createElement('storymap-legend-ramp');
    const labels = createElement('storymap-legend-labels');

    // Each colour is where its value is between the first and the last: by the value
    // itself, or by its logarithm, for what is measured over orders of magnitude.
    const place = scale === 'log' ? Math.log : (value) => value;

    ramp.style.backgroundImage = `linear-gradient(to right, ${stops
      .map(([value, colour]) => `${colour} ${((place(value) - place(first)) / (place(last) - place(first))) * 100}%`)
      .join(', ')})`;
    labels.append(createElement('', String(first)), createElement('', String(last)));
    legend.append(ramp, labels);
  }

  for (const { label, color } of items) {
    const item = createElement('storymap-legend-item');
    const swatch = createElement('storymap-legend-swatch');

    swatch.style.backgroundColor = color;
    item.append(swatch, label ?? '');
    legend.append(item);
  }

  return legend;
}

// The legends and the figure of a storymap are in one stack over its map, which the
// view of a step leaves room for.
function getPanels(storymap) {
  if (!storymap.legendsContainer) {
    storymap.legendsContainer = createElement('storymap-legends');
    storymap.container.append(storymap.legendsContainer);
  }

  return storymap.legendsContainer;
}

/**
 * Adds the legends of the settings to the map: one, or a list of them.
 *
 * @ignore
 */
export function addLegends(storymap) {
  const legends = [storymap.configuration.legend ?? []].flat();

  if (!legends.length) {
    return;
  }

  const container = getPanels(storymap);

  storymap.legends = legends.map((legend) => ({
    layer: legend.layer,
    title: legend.title,
    element: container.appendChild(createLegend(legend))
  }));
}

/**
 * Adds the figures of the steps to the map: the pictures that steps show over it, in a
 * panel under the legends. The steps keep their own figures, which screen readers read
 * with the step, so the ones over the map are copies, hidden from them. `onLoad(figure)`
 * is called when a copy has loaded, and the panel has its size.
 *
 * @ignore
 */
export function addFigures(storymap, onLoad) {
  const figures = storymap.steps.map((step) => step.querySelector(':scope > .storymap-figure'));

  if (!figures.some(Boolean)) {
    return;
  }

  const panel = createElement('storymap-figure-panel');
  // Steps that name the same picture share its copy, so it stays as it is between them.
  const copies = new Map();

  panel.setAttribute('aria-hidden', 'true');
  panel.hidden = true;

  storymap.figures = figures.map((figure) => {
    const source = figure?.getAttribute('src');

    if (source && !copies.has(source)) {
      const copy = Object.assign(document.createElement('img'), { className: 'storymap-figure', alt: '' });

      copy.dataset.src = source;
      copy.addEventListener('load', () => onLoad(copy));
      copies.set(source, panel.appendChild(copy));
    }

    return copies.get(source) ?? null;
  });
  storymap.figurePanel = panel;
  getPanels(storymap).append(panel);
  storymap.element.classList.add('has-figures');
}

/**
 * Shows the figure of a step, if it has one. A figure is loaded when its step, or the
 * step before it, is shown.
 *
 * @ignore
 */
export function showFigure(storymap, index) {
  const { figures, figurePanel } = storymap;

  if (!figurePanel) {
    return;
  }

  for (const figure of new Set(figures)) {
    figure?.classList.toggle('is-active', figure === figures[index]);
  }

  figurePanel.hidden = !figures[index];

  // A narrow map has no room for the panel, and the figures stay in their steps.
  if (getComputedStyle(figurePanel).display === 'none') {
    return;
  }

  for (const figure of [figures[index], figures[index + 1]]) {
    if (figure && !figure.getAttribute('src')) {
      figure.src = figure.dataset.src;
    }
  }
}

/**
 * Shows the legends of a step. A legend that names a layer shows with that layer, and
 * the others with every step. A title can name the step's date, as `{date|date}`, for a
 * layer that shows another day's map at each step.
 *
 * @ignore
 */
export function showLegends(storymap, isLayerShown, date) {
  const locale = document.documentElement.lang || undefined;

  storymap.legends?.forEach(({ layer, title, element }) => {
    element.hidden = Boolean(layer) && !isLayerShown(layer);

    if (typeof title === 'string' && title.includes('{date')) {
      element.querySelector('.storymap-legend-title').textContent = formatTemplate(title, { date }, locale);
    }
  });
}

/**
 * Fills a popup's text with the properties of a feature. `{name}` is a property as it
 * is. `{time|date}` shows it as a date and `{time|datetime}` with the time as well,
 * both in UTC. `{depth|1}` shows a number with one decimal. A property that the feature
 * doesn't have is a dash.
 *
 * @ignore
 */
export function formatTemplate(template, properties = {}, locale) {
  return template.replace(/\{([^{}|]+)(?:\|([^{}]+))?\}/g, (match, name, format = '') => {
    const value = properties[name.trim()];

    if (value === undefined || value === null || value === '') {
      return '–';
    }

    if (format === 'date' || format === 'datetime') {
      const date = new Date(value);

      return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString(locale, {
        dateStyle: 'medium',
        ...(format === 'datetime' && { timeStyle: 'short' }),
        timeZone: 'UTC'
      });
    }

    if (/^\d+$/.test(format) && Number.isFinite(Number(value))) {
      return Number(value).toLocaleString(locale, { minimumFractionDigits: Number(format), maximumFractionDigits: Number(format) });
    }

    return String(value);
  });
}

/**
 * Shows a popup with the properties of the feature under the pointer, or under a tap,
 * for the layers that the settings give a popup text.
 *
 * @ignore
 */
export function addPopups(storymap, maplibregl) {
  const { map, configuration } = storymap;
  const templates = configuration.popups ?? {};

  if (!Object.keys(templates).length) {
    return;
  }

  // The text is set as text, so the properties of a feature can't add markup.
  const popup = new maplibregl.Popup({
    className: 'storymap-popup',
    closeButton: false,
    closeOnClick: false,
    focusAfterOpen: false,
    maxWidth: '18rem',
    offset: 12
  });
  const locale = document.documentElement.lang || undefined;

  const showAt = ({ point, lngLat }) => {
    // Layers that a step hides aren't drawn, so they have no feature to point at.
    const layers = Object.keys(templates).filter((id) => map.getLayer(id));
    const [feature] = layers.length ? map.queryRenderedFeatures([
      [point.x - POPUP_REACH, point.y - POPUP_REACH],
      [point.x + POPUP_REACH, point.y + POPUP_REACH]
    ], { layers }) : [];

    map.getCanvas().style.cursor = feature ? 'crosshair' : '';

    if (!feature) {
      popup.remove();

      return;
    }

    popup.setLngLat(lngLat).setText(formatTemplate(templates[feature.layer.id], feature.properties, locale));

    if (!popup.isOpen()) {
      popup.addTo(map);
    }
  };

  map.on('mousemove', showAt);
  map.on('click', showAt);
  map.on('mouseout', () => popup.remove());
}
