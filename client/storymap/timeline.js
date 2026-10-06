/**
 * The timeline of a storymap: the layers whose features hold a time. A step shows them
 * from its `from` and up to its `until`. Between two steps the time runs from the one to
 * the other, so a track draws itself as the reader scrolls, and markers can lead it: one,
 * or one for each of the tracks that share the timeline.
 *
 * The times and the positions are read from the GeoJSON of the timeline's sources. With
 * another kind of source, or until that data has arrived, a step shows its time at once.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// How long the time takes to run from one step to the next, in milliseconds, unless the
// step sets its own duration.
const DEFAULT_DURATION = 2000;

// A date without a time includes the whole day.
const getUpperBound = (until) => until && DATE_RE.test(until) ? `${until}T23:59:59.999Z` : until;

/**
 * The filter clauses that keep the features of a timeline layer within a step's time.
 * While the time runs, `until` is where it has got to, in place of the step's own.
 *
 * @ignore
 */
export function getTimeClauses(timeline, view, until = getUpperBound(view.until)) {
  const time = ['get', timeline.property ?? 'time'];

  return [view.from && ['>=', time, view.from], until && ['<=', time, until]].filter(Boolean);
}

/**
 * The time that a step shows the timeline up to, in milliseconds: all of it without an
 * `until`.
 *
 * @ignore
 */
export function getTime(view) {
  return view.until ? Date.parse(getUpperBound(view.until)) : Infinity;
}

// Where a feature's geometry ends: where a track had got to at the feature's time.
function getPosition(geometry) {
  switch (geometry?.type) {
    case 'Point':
      return geometry.coordinates;
    case 'LineString':
      return geometry.coordinates.at(-1);
    case 'MultiLineString':
      return geometry.coordinates.at(-1)?.at(-1);
    default:
      return null;
  }
}

/**
 * The moments of a GeoJSON source: the time and the position of each of its features
 * that has both, from the first to the last. With `where`, only of the features that
 * have those values for those properties, such as the track of one vessel among several.
 *
 * @ignore
 */
export function getMoments(geojson, property = 'time', where = {}) {
  const features = geojson?.type === 'FeatureCollection' ? geojson.features : [geojson];
  const conditions = Object.entries(where);

  return features
    .filter((feature) => conditions.every(([name, value]) => feature?.properties?.[name] === value))
    .map((feature) => ({ time: Date.parse(feature?.properties?.[property]), position: getPosition(feature?.geometry) }))
    .filter((moment) => Number.isFinite(moment.time) && moment.position)
    .sort((first, second) => first.time - second.time);
}

/**
 * How many of the moments have come by a time.
 *
 * @ignore
 */
export function countMoments(moments, time) {
  let low = 0;
  let high = moments.length;

  while (low < high) {
    const middle = (low + high) >> 1;

    if (moments[middle].time <= time) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
}

/**
 * The markers of a timeline, each as its settings. `marker` is `true` for one marker at
 * the head of the timeline, the id of the source that it follows, the settings of a
 * marker, or a list of any of them.
 *
 * @ignore
 */
export function getMarkers(timeline) {
  return [timeline.marker ?? []].flat().filter(Boolean).map((marker) => {
    if (marker === true) {
      return {};
    }

    return typeof marker === 'string' ? { source: marker } : marker;
  });
}

async function readGeoJSON(data) {
  if (typeof data !== 'string') {
    return data;
  }

  const response = await fetch(data);

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return response.json();
}

// A marker's dot, in its colour, with its label beside it.
function createMarkerElement({ color, label, side = 'right' }) {
  const element = Object.assign(document.createElement('div'), { className: 'storymap-marker' });

  // It shows where the story has got to, which the step says in words.
  element.setAttribute('aria-hidden', 'true');

  if (color) {
    element.style.setProperty('--storymap-marker', color);
  }

  if (label) {
    element.append(Object.assign(document.createElement('span'), {
      className: `storymap-marker-label is-${side}`,
      textContent: label
    }));
  }

  return element;
}

/**
 * Runs a storymap's timeline. `getSource(id)` gives a source of the settings, with its
 * URLs resolved, and `showLayers(view, until)` shows a step's layers with the timeline
 * up to `until`, an ISO time, or up to the step's own without it.
 *
 * @ignore
 */
export function createTimeline({ map, views, configuration }, maplibregl, getSource, showLayers) {
  const timeline = configuration.timeline;
  const layerSources = (configuration.layers ?? [])
    .filter((layer) => timeline.layers?.includes(layer.id))
    .map((layer) => layer.source);
  // A marker follows the source that it names, or else that of the first timeline layer.
  const markers = getMarkers(timeline).map((settings) => ({
    settings,
    source: settings.source ?? layerSources[0],
    moments: [],
    marker: null,
    isShown: false
  }));
  // The moments of every source: the times that the timeline's features change at.
  let moments = [];
  let time = getTime(views[0]);
  let frame;
  let isRemoved = false;

  // Each marker is at the last position that the time has reached on its track, and away
  // before the first one.
  function moveMarkers() {
    for (const item of markers) {
      const moment = item.moments[countMoments(item.moments, time) - 1];

      if (!moment) {
        item.marker?.remove();
        item.isShown = false;

        continue;
      }

      item.marker ??= new maplibregl.Marker({ element: createMarkerElement(item.settings) });
      item.marker.setLngLat(moment.position);

      if (!item.isShown) {
        item.marker.addTo(map);
        item.isShown = true;
      }
    }
  }

  function show(index, isAnimated) {
    const view = views[index];
    const target = getTime(view);
    const runs = isAnimated && moments.length > 1 && timeline.animate !== false &&
      !matchMedia('(prefers-reduced-motion: reduce)').matches;
    // A run starts and ends within the data, so the time doesn't run through the days
    // before or after it.
    const clamp = (value) => runs ? Math.min(Math.max(value, moments[0].time), moments.at(-1).time) : target;
    const start = clamp(time);
    const end = clamp(target);
    const duration = view.duration ?? DEFAULT_DURATION;
    const startedAt = performance.now();
    let shown;

    cancelAnimationFrame(frame);

    const run = (now) => {
      const progress = start === end || !duration ? 1 : Math.min((now - startedAt) / duration, 1);

      if (progress === 1) {
        time = target;
        showLayers(view);
        moveMarkers();

        return;
      }

      // Slow at both ends, as the moves of the map are.
      const eased = progress < 0.5 ? 2 * progress ** 2 : 1 - (2 - 2 * progress) ** 2 / 2;

      time = start + (end - start) * eased;

      // The layers are only filtered again when the time has reached another feature.
      const count = countMoments(moments, time);

      if (count !== shown) {
        shown = count;
        showLayers(view, new Date(time).toISOString());
        moveMarkers();
      }

      frame = requestAnimationFrame(run);
    };

    run(startedAt);
  }

  const sourceIds = [...new Set([...layerSources, ...markers.map((item) => item.source)])]
    .filter((id) => getSource(id)?.type === 'geojson');

  Promise.all(sourceIds.map(async (id) => {
    try {
      return [id, await readGeoJSON(getSource(id).data)];
    } catch (error) {
      // Without the times, each step still shows its part of the timeline, at once.
      console.error(`The storymap's timeline doesn't run for the source ${id}, because its data couldn't be read:`, error);

      return [id, null];
    }
  })).then((entries) => {
    if (isRemoved) {
      return;
    }

    const data = new Map(entries);

    moments = entries
      .flatMap(([, geojson]) => geojson ? getMoments(geojson, timeline.property) : [])
      .sort((first, second) => first.time - second.time);

    for (const item of markers) {
      item.moments = data.get(item.source) ? getMoments(data.get(item.source), timeline.property, item.settings.where) : [];
    }

    moveMarkers();
  });

  return {
    show,
    remove() {
      isRemoved = true;
      cancelAnimationFrame(frame);
      markers.forEach((item) => item.marker?.remove());
    }
  };
}
