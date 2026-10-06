/**
 * Draws the maps of storymaps. The Markdown extension in lib/md-plugins/storymap.js
 * writes the steps and the map settings, and PostDoc loads this module on the pages
 * that have a storymap.
 *
 * The map stays in view while the reader scrolls through the steps, and shows each
 * step's view as the step reaches the middle of the window. A view is complete in
 * itself: scrolling back up shows what the reader saw on the way down.
 *
 * MapLibre, and PMTiles when a source uses it, are loaded the first time a page needs
 * them.
 *
 * A storymap whose steps have pictures shows them in place of the map, and loads neither.
 *
 * timeline.js runs the time between the steps, dated.js shows the layers that have a
 * map for each day, and overlays.js adds what goes over the map: its controls, legends
 * and popups.
 */

import './storymap.css';
import { onLeave, onRender } from '../page/index.js';
import { createDatedLayers, isDated, resolveDates, setDate } from './dated.js';
import { addControls, addFigures, addLegends, addPopups, showFigure, showLegends } from './overlays.js';
import { createTimeline, getTimeClauses } from './timeline.js';

const MAPLIBRE_SCRIPT = 'https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.js';
const MAPLIBRE_STYLESHEET = 'https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.css';
const PMTILES_SCRIPT = 'https://cdn.jsdelivr.net/npm/pmtiles@4.5.0/dist/pmtiles.js';

// OpenFreeMap's styles are free to use and need no key.
const DEFAULT_STYLE = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark'
};

// PostDoc waits for a page's maps before it marks the page ready, but not for longer
// than this, so a slow tile server doesn't hold the page up.
const MAP_LOAD_TIMEOUT = 8000;
// Room for the zoom buttons on the right and the attribution at the bottom.
const FIT_BOUNDS_PADDING = { top: 40, right: 56, bottom: 72, left: 40 };
// The room between a legend and what a step shows.
const LEGEND_GAP = 16;
// The room between a figure and the edges of the map, and the floating steps.
const FIGURE_GAP = 10;
const NO_PADDING = { top: 0, right: 0, bottom: 0, left: 0 };
// How long the tiles of a dated layer take to fade in over the day before, in
// milliseconds: MapLibre's fade of raster tiles, and a little more.
const COPY_FADE_DURATION = 400;

const BASE = import.meta.env?.BASE_URL ?? '/';

const scripts = new Map();
const storymaps = new Set();
let hasPMTilesProtocol = false;

function loadScript(src) {
  if (!scripts.has(src)) {
    scripts.set(src, new Promise((resolve, reject) => {
      document.head.append(Object.assign(document.createElement('script'), {
        src,
        onload: resolve,
        onerror: () => reject(new Error(`Couldn't load ${src}`))
      }));
    }));
  }

  return scripts.get(src);
}

function loadStylesheet(href) {
  if (!document.querySelector(`link[href="${href}"]`)) {
    document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href }));
  }
}

// A URL that starts with / is relative to the site, which may be served from a subfolder.
function resolveUrl(url) {
  if (typeof url !== 'string') {
    return url;
  }

  if (url.startsWith('pmtiles://')) {
    return 'pmtiles://' + new URL(resolveUrl(url.slice('pmtiles://'.length)), location.href).href;
  }

  return url.startsWith('/') && !url.startsWith('//') ? BASE + url.slice(1) : url;
}

// A source with its URLs resolved, and for the day that `date` names when it's dated.
function resolveSource(source, date) {
  const resolve = (url) => resolveUrl(setDate(url, date));

  return {
    ...source,
    ...(typeof source.data === 'string' && { data: resolve(source.data) }),
    ...(source.url && { url: resolve(source.url) }),
    ...(source.tiles && { tiles: source.tiles.map(resolve) })
  };
}

const usesPMTiles = (configuration) => Object.values(configuration.sources ?? {})
  .some((source) => [source.url, ...(source.tiles ?? [])].some((url) => String(url ?? '').startsWith('pmtiles://')));

async function loadMapLibre(configuration) {
  loadStylesheet(MAPLIBRE_STYLESHEET);
  await loadScript(MAPLIBRE_SCRIPT);

  if (usesPMTiles(configuration)) {
    await loadScript(PMTILES_SCRIPT);

    if (!hasPMTilesProtocol) {
      window.maplibregl.addProtocol('pmtiles', new window.pmtiles.Protocol().tile);
      hasPMTilesProtocol = true;
    }
  }

  return window.maplibregl;
}

function isDark() {
  const theme = document.documentElement.getAttribute('data-theme');

  return theme ? theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
}

// The base map: a style URL, a style object, or a light and a dark one.
function getStyle(configuration) {
  const style = configuration.style ?? DEFAULT_STYLE;

  if (typeof style === 'string' || style.version) {
    return resolveUrl(style);
  }

  return resolveUrl(isDark() ? style.dark ?? style.light : style.light ?? style.dark);
}

// Each step's camera: its own, or the last one before it. The first step falls back to
// the camera in the map settings. A step that doesn't turn or tilt the map sees it from
// above with north up, whatever the step before it did.
function resolveCameras(views, configuration) {
  let camera = {
    center: configuration.center,
    zoom: configuration.zoom,
    bearing: configuration.bearing,
    pitch: configuration.pitch,
    bounds: configuration.bounds
  };

  return views.map((view) => {
    if (view.bounds || view.center || view.zoom !== undefined || view.bearing !== undefined || view.pitch !== undefined) {
      camera = view.bounds ? { bounds: view.bounds, bearing: view.bearing ?? 0, pitch: view.pitch ?? 0 } : {
        center: view.center ?? camera.center,
        zoom: view.zoom ?? camera.zoom,
        bearing: view.bearing ?? 0,
        pitch: view.pitch ?? 0
      };
    }

    return camera;
  });
}

const withoutUndefined = (object) => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));

// Floating steps are cards beside the view on a wide map, and as wide as the map on a
// narrow one.
function areStepsBeside(storymap) {
  const map = storymap.container.getBoundingClientRect();

  return storymap.steps[0].getBoundingClientRect().right < map.left + map.width / 2;
}

// A figure is as wide as the room that the floating steps leave beside them, or as the
// map. The stylesheet keeps it from getting wider than is good to look at.
function sizeFigure(storymap) {
  if (!storymap.figurePanel) {
    return;
  }

  const map = storymap.container.getBoundingClientRect();
  const room = storymap.isFloating && areStepsBeside(storymap)
    ? map.right - storymap.steps[0].getBoundingClientRect().right
    : map.width;

  // The legends that show with a figure are in a row above it, as wide as it is.
  storymap.legendsContainer.style.setProperty('--storymap-figure-room', `${Math.max(Math.round(room - 2 * FIGURE_GAP), 0)}px`);
}

// The room around what a step shows. The legends and the figure that show with the step
// take up some of it, at the top or the bottom of the map. A floating step covers part of the map, so the
// view goes beside it, or in the top of the map on a narrow page, which the card comes up
// from the bottom to.
function getPadding(storymap) {
  const padding = { ...FIT_BOUNDS_PADDING };
  const map = storymap.container.getBoundingClientRect();
  const legends = storymap.legendsContainer?.getBoundingClientRect();

  // They are at the edge of the map that they are nearest to.
  if (legends?.height) {
    if (legends.top - map.top < map.bottom - legends.bottom) {
      padding.top = Math.round(legends.bottom - map.top) + LEGEND_GAP;
    } else {
      padding.bottom = Math.round(map.bottom - legends.top) + LEGEND_GAP;
    }
  }

  if (!storymap.isFloating) {
    return padding;
  }

  const step = storymap.steps[0].getBoundingClientRect();

  return areStepsBeside(storymap)
    ? { ...padding, left: Math.round(step.right - map.left) + FIT_BOUNDS_PADDING.left }
    : { ...padding, bottom: Math.round(map.height * 0.6) };
}

// The centre and the zoom that fit an area into the room that the padding leaves. When
// what is over the map leaves no room at all, the area is fitted into the map as it is:
// MapLibre has no answer then, and on a globe it throws.
function fitBounds(map, bounds, bearing, padding) {
  for (const room of [padding, FIT_BOUNDS_PADDING]) {
    try {
      const fit = map.cameraForBounds(bounds, { bearing, padding: room });

      if (fit) {
        return fit;
      }
    } catch {
      // The next try has more room.
    }
  }

  return {};
}

// What a step shows goes in the middle of the room that the padding leaves.
//
// A place is centred there with the map's own padding, which moves a globe as a whole,
// where an offset would turn it to another side. An area is fitted into the padding
// instead: MapLibre works that out from the padding it's given for the fit, on top of
// the map's own, so the map has none for an area. The map keeps its padding from one
// move to the next, so each move sets it.
//
// A step can say how long the move to it takes, in milliseconds, or how fast it is.
function moveCamera(map, camera, isAnimated, padding, { duration, speed } = {}) {
  const animate = isAnimated && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  let { center, zoom } = camera;
  let mapPadding = padding;

  if (camera.bounds) {
    const [west, south, east, north] = camera.bounds;
    const current = map.getPadding();

    map.setPadding(NO_PADDING);
    ({ center, zoom } = fitBounds(map, [[west, south], [east, north]], camera.bearing, padding));
    // The move starts from the padding that the map has.
    map.setPadding(current);
    mapPadding = NO_PADDING;
  }

  const options = withoutUndefined({ center, zoom, bearing: camera.bearing, pitch: camera.pitch, padding: mapPadding });

  if (animate) {
    map.flyTo(withoutUndefined({ ...options, duration, speed }));
  } else {
    map.jumpTo(options);
  }
}

// A layer shows as the map settings say, apart from the step's show and hide lists.
function isShown(layer, view) {
  if (!layer) {
    return false;
  }

  return Boolean(view.show?.includes(layer.id)) || (layer.layout?.visibility !== 'none' && !view.hide?.includes(layer.id));
}

// Shows the layers and the part of the timeline that a step asks for. While the time
// runs to the step's, `until` is where it has got to.
function applyLayers(storymap, view, until) {
  const { map, configuration } = storymap;
  const timeline = configuration.timeline;

  for (const layer of configuration.layers ?? []) {
    if (!map.getLayer(layer.id)) {
      continue;
    }

    map.setLayoutProperty(layer.id, 'visibility', isShown(layer, view) ? 'visible' : 'none');

    if (timeline?.layers?.includes(layer.id)) {
      const filter = [layer.filter, ...getTimeClauses(timeline, view, until)].filter(Boolean);

      map.setFilter(layer.id, filter.length > 1 ? ['all', ...filter] : filter[0] ?? null);
    }
  }
}

const isLayerDated = (configuration, layer) => isDated(configuration.sources?.[layer.source]);

// A timeline is drawn from many short features, such as the legs of a track. When the
// map is zoomed out, MapLibre leaves out the lines that are shorter than its tolerance,
// which leaves gaps where a vessel was slow. So the GeoJSON sources of timeline layers
// are drawn as they are, unless they set a tolerance of their own.
function withTimelineTolerance(configuration, id, source) {
  const isTimelineSource = (configuration.layers ?? [])
    .some((layer) => layer.source === id && configuration.timeline?.layers?.includes(layer.id));

  return source.type === 'geojson' && isTimelineSource ? { tolerance: 0, ...source } : source;
}

function addData(storymap) {
  const { map, configuration } = storymap;

  // A style brings its own projection, so the storymap's is set again after each one.
  // A globe gets an atmosphere, unless the style has a sky of its own.
  if (configuration.projection) {
    map.setProjection({ type: configuration.projection });

    if (configuration.projection === 'globe' && !map.getSky()) {
      map.setSky({ 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0] });
    }
  }

  // Dated sources and their layers are added for the date of each step.
  for (const [id, source] of Object.entries(configuration.sources ?? {})) {
    if (!isDated(source) && !map.getSource(id)) {
      map.addSource(id, withTimelineTolerance(configuration, id, resolveSource(source)));
    }
  }

  for (const layer of configuration.layers ?? []) {
    if (!isLayerDated(configuration, layer) && !map.getLayer(layer.id)) {
      map.addLayer(layer);
    }
  }
}

function showStep(storymap, index, isAnimated = true) {
  const { map, steps, views, cameras, pictures } = storymap;

  storymap.activeIndex = index;
  steps.forEach((step, stepIndex) => step.classList.toggle('is-active', stepIndex === index));

  if (pictures) {
    pictures.forEach((picture) => picture.classList.toggle('is-active', picture === pictures[index]));

    return;
  }

  // The step's figure and legends show first, so that the move leaves room for them.
  sizeFigure(storymap);
  showFigure(storymap, index);
  showLegends(
    storymap,
    (id) => isShown(storymap.configuration.layers?.find((layer) => layer.id === id), views[index]),
    storymap.dates[index]
  );
  moveCamera(map, cameras[index], isAnimated, getPadding(storymap), views[index]);

  // While the base map changes, the map has no layers to add to. The dated ones are
  // shown again once the new one is there.
  if (!storymap.isStyleChanging) {
    storymap.datedLayers.show(index);
  }

  // The time of a timeline runs to the step's. Without one, the step's layers just show.
  if (storymap.timeline) {
    storymap.timeline.show(index, isAnimated);
  } else {
    applyLayers(storymap, views[index]);
  }

  // On a small map, MapLibre shows the credits until the reader drags the map. Readers
  // scroll through a storymap instead, so they fold away after the first step, behind
  // their button.
  if (isAnimated) {
    const credits = map.getContainer().querySelector('.maplibregl-compact-show');

    credits?.removeAttribute('open');
    credits?.classList.remove('maplibregl-compact-show');
  }

  // Screen readers name the map after the step it shows.
  const title = steps[index].querySelector('h1, h2, h3, h4, h5, h6')?.textContent.trim();

  map.getCanvas().setAttribute('aria-label', title ? `Map: ${title}` : 'Map');
}

function showError(element, error) {
  console.error('The storymap\'s map couldn\'t be drawn:', error);

  const container = element.querySelector('.storymap-map');

  container.hidden = false;
  container.replaceChildren(Object.assign(document.createElement('p'), {
    className: 'storymap-error',
    textContent: `The map couldn't be drawn: ${error.message}`
  }));
}

// The map shows the last step that has reached a line across the window: the middle of
// the map when the steps float beside the view, or two thirds of the way down when they
// come up under it, the middle of the window beside a docked map, or the middle of what
// the map leaves below it on a narrow page. The observer watches the part of the window
// above the line, so a jump, such as to a heading, shows the right step too.
function getStepLine(storymap) {
  const { element, container } = storymap;
  const mapTop = parseFloat(getComputedStyle(container).top);
  const mapBottom = mapTop + container.offsetHeight;

  if (storymap.isFloating) {
    return Math.round(mapTop + (Math.min(mapBottom, innerHeight) - mapTop) * (areStepsBeside(storymap) ? 0.5 : 0.65));
  }

  if (getComputedStyle(element.querySelector('.storymap-body')).display !== 'grid') {
    return Math.round((mapBottom + innerHeight) / 2);
  }

  return Math.round(innerHeight / 2);
}

function observeSteps(storymap) {
  const { steps } = storymap;
  const line = getStepLine(storymap);
  const stepsAboveLine = new Set();

  storymap.stepObserver?.disconnect();
  storymap.stepObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      stepsAboveLine[entry.isIntersecting ? 'add' : 'delete'](steps.indexOf(entry.target));
    }

    // Before the first step and after the last, the map keeps the view it has.
    const index = stepsAboveLine.size ? Math.max(...stepsAboveLine) : storymap.activeIndex;

    if (index !== storymap.activeIndex) {
      showStep(storymap, index);
    }
  }, { rootMargin: `0px 0px ${line - innerHeight}px 0px` });

  steps.forEach((step) => storymap.stepObserver.observe(step));
}

// Shows the first step, and then each step as the reader reaches it.
function followSteps(storymap) {
  showStep(storymap, 0, false);
  observeSteps(storymap);

  // The line moves with the size of the window and of the map, and so does the room for
  // a figure.
  storymap.events = new AbortController();
  addEventListener('resize', () => {
    observeSteps(storymap);
    sizeFigure(storymap);
  }, { signal: storymap.events.signal });
}

// Pictures in place of the map. The steps keep their own pictures, which screen readers
// read with the step, so the ones that stay in view are copies, hidden from them.
function createPictures(storymap, images) {
  const { element, container } = storymap;
  const copies = images.map((image) => image?.cloneNode());
  // Each step's picture: its own, or the last one before it. The steps before the first
  // picture show that one.
  let picture = copies.find(Boolean);

  storymap.pictures = copies.map((copy) => {
    picture = copy ?? picture;

    return picture;
  });

  container.replaceChildren(...copies.filter(Boolean));
  container.setAttribute('aria-hidden', 'true');
  container.hidden = false;
  element.classList.add('has-map', 'has-pictures');
  element.classList.toggle('is-floating', storymap.isFloating);

  storymaps.add(storymap);
  followSteps(storymap);
}

// A storymap's own layout, or else the one that the page sets for its storymaps, such as
// a story page, where they float.
function getLayout(element, configuration) {
  return configuration.layout ?? element.closest('[data-storymap-layout]')?.dataset.storymapLayout ?? 'docked';
}

async function createStorymap(element) {
  const configuration = JSON.parse(element.querySelector('.storymap-configuration')?.textContent || '{}');
  const steps = [...element.querySelectorAll(':scope > .storymap-body > .storymap-steps > .storymap-step')];
  const views = steps.map((step) => JSON.parse(step.dataset.view || '{}'));
  const container = element.querySelector('.storymap-map');
  const isFloating = getLayout(element, configuration) === 'floating';
  const images = steps.map((step) => step.querySelector(':scope > .storymap-image'));

  if (images.some(Boolean)) {
    createPictures({ element, container, configuration, steps, views, activeIndex: 0, isFloating }, images);

    return;
  }

  let maplibregl;

  try {
    maplibregl = await loadMapLibre(configuration);
  } catch (error) {
    // Without the map, the steps still read as a page.
    console.error('The storymap\'s map is unavailable:', error);

    return;
  }

  const cameras = resolveCameras(views, configuration);

  container.hidden = false;
  element.classList.add('has-map');
  element.classList.toggle('is-floating', isFloating);

  const storymap = {
    element,
    container,
    configuration,
    steps,
    views,
    cameras,
    dates: resolveDates(views),
    activeIndex: 0,
    isFloating,
    style: getStyle(configuration)
  };
  const map = new maplibregl.Map(withoutUndefined({
    // Scrolling the page shouldn't zoom the map: that takes Ctrl or two fingers.
    cooperativeGestures: true,
    // Other options of the map, such as minZoom or maxBounds.
    ...configuration.map,
    container,
    style: getStyle(configuration)
  }));

  // The first step's view is there before the map is first drawn.
  moveCamera(map, cameras[0], false, getPadding(storymap));
  addControls(map, maplibregl, configuration);
  // Around a globe there is room for the sky, which the stylesheet draws.
  element.classList.toggle('is-globe', configuration.projection === 'globe');

  storymap.map = map;
  storymap.datedLayers = createDatedLayers(storymap, { resolveSource, isShown });
  storymaps.add(storymap);

  await Promise.race([
    new Promise((resolve) => map.once('load', resolve)),
    new Promise((resolve) => setTimeout(resolve, MAP_LOAD_TIMEOUT))
  ]);

  try {
    addData(storymap);
  } catch (error) {
    showError(element, error);

    return;
  }

  addLegends(storymap);
  // A figure that arrives after its step is shown changes the room that is left for the
  // view, so the map moves once more.
  addFigures(storymap, (figure) => {
    const index = storymap.activeIndex;

    if (figure === storymap.figures[index]) {
      moveCamera(map, cameras[index], true, getPadding(storymap), views[index]);
    }
  });
  addPopups(storymap, maplibregl);

  if (configuration.timeline) {
    storymap.timeline = createTimeline(
      storymap,
      maplibregl,
      (id) => configuration.sources?.[id] && resolveSource(configuration.sources[id]),
      (view, until) => applyLayers(storymap, view, until)
    );
  }

  // A day's tiles fade in as they load, and then the day before it is taken away.
  const removeCopiesSoon = () => {
    storymap.copiesTimer ??= setTimeout(() => {
      storymap.copiesTimer = null;

      if (!storymap.isStyleChanging) {
        storymap.datedLayers.removeOld();
      }
    }, COPY_FADE_DURATION);
  };

  map.on('sourcedata', ({ sourceId }) => {
    if (sourceId && storymap.datedLayers.hasOld(sourceId) && map.isSourceLoaded(sourceId)) {
      removeCopiesSoon();
    }
  });
  map.on('idle', () => {
    if (storymap.datedLayers.hasOld()) {
      removeCopiesSoon();
    }
  });

  followSteps(storymap);

  // The base map follows the site between light and dark, including a change made
  // while the map was loading.
  const followTheme = () => {
    const style = getStyle(configuration);

    if (style !== storymap.style) {
      storymap.style = style;
      storymap.isStyleChanging = true;
      map.setStyle(style);
      map.once('style.load', () => {
        // A style takes the copies of the dated layers with it.
        storymap.isStyleChanging = false;
        storymap.datedLayers.clear();
        addData(storymap);
        storymap.datedLayers.show(storymap.activeIndex);
        applyLayers(storymap, views[storymap.activeIndex]);
      });
    }
  };

  storymap.themeObserver = new MutationObserver(followTheme);
  storymap.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  followTheme();
}

function removeStorymaps() {
  for (const storymap of storymaps) {
    storymap.stepObserver?.disconnect();
    storymap.themeObserver?.disconnect();
    storymap.events?.abort();
    storymap.timeline?.remove();
    clearTimeout(storymap.copiesTimer);
    storymap.legendsContainer?.remove();
    storymap.map?.remove();
  }

  storymaps.clear();
}

onRender(() => Promise.all([...document.querySelectorAll('.storymap')].map(createStorymap)), {
  forPage() {
    return true;
  }
});

onLeave(removeStorymaps, {
  forPage() {
    return true;
  }
});
