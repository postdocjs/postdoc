/**
 * Dated sources: maps that there is one of for each day, such as a satellite's picture of
 * the sea. A source is dated when its address has {date} in it, which is filled with the
 * date of the step that the map shows.
 *
 * The map has a copy of a dated layer, and of its source, for the day that it shows. The
 * copy for a new day goes over the one before it, which stays until the new tiles have
 * loaded, so one day's map fades into the next.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}/;
const PLACEHOLDER = '{date}';

/**
 * Whether a source has {date} in its address: its tiles, its URL or its data.
 *
 * @ignore
 */
export function isDated(source) {
  return [source?.url, source?.data, ...(source?.tiles ?? [])]
    .some((url) => typeof url === 'string' && url.includes(PLACEHOLDER));
}

/**
 * An address for a day: with the date, as 2023-07-17, in place of {date}.
 *
 * @ignore
 */
export function setDate(url, date) {
  return typeof url === 'string' && date ? url.replaceAll(PLACEHOLDER, date) : url;
}

/**
 * Each step's date: its own, or the day of its `until`, or else the date of the step
 * before it. The steps before the first date have that one, so a date never depends on
 * the way the reader came.
 *
 * @ignore
 */
export function resolveDates(views) {
  const own = views.map((view) => view.date ?? DATE_RE.exec(view.until ?? '')?.[0]);
  let date = own.find(Boolean);

  return own.map((value) => {
    date = value ?? date;

    return date;
  });
}

/**
 * Shows the dated layers of a storymap for the date of each step. `resolveSource(source,
 * date)` gives a source of the settings for a day, and `isShown(layer, view)` says
 * whether a step shows a layer.
 *
 * @ignore
 */
export function createDatedLayers({ map, configuration, views, dates }, { resolveSource, isShown }) {
  const layers = configuration.layers ?? [];
  // For each dated layer: the copy for the day that the map shows, and the copies for
  // the days before it that are still on the map, the oldest first.
  const copiesOfLayers = new Map(layers
    .filter((layer) => isDated(configuration.sources?.[layer.source]))
    .map((layer) => [layer.id, { current: null, old: [], isShown: false }]));

  const removeCopy = (id) => {
    if (map.getLayer(id)) {
      map.removeLayer(id);
    }

    if (map.getSource(id)) {
      map.removeSource(id);
    }
  };

  // The layer of the settings that comes after a dated layer and is on the map, which
  // the copies of the dated layer go under.
  function getLayerAbove(layer) {
    for (const next of layers.slice(layers.indexOf(layer) + 1)) {
      const copies = copiesOfLayers.get(next.id);
      const id = copies ? [...copies.old, copies.current].find(Boolean) : next.id;

      if (id && map.getLayer(id)) {
        return id;
      }
    }
  }

  // Takes away the copies for the days that the map has moved on from: those of one
  // layer at once, or else those that the tiles of the day it shows are there to cover.
  function removeOld(layerId) {
    for (const [id, copies] of copiesOfLayers) {
      const isCovered = !map.getSource(copies.current) || map.isSourceLoaded(copies.current);

      if (copies.old.length && (layerId ? id === layerId : isCovered)) {
        copies.old.forEach(removeCopy);
        copies.old = [];
      }
    }
  }

  function show(index) {
    const date = dates[index];

    for (const layer of layers) {
      const copies = copiesOfLayers.get(layer.id);
      const id = date && `${layer.id}@${date}`;

      if (!copies) {
        continue;
      }

      copies.isShown = Boolean(id) && isShown(layer, views[index]);

      if (id && id !== copies.current) {
        // A copy that is still on the map from before is used again.
        copies.old = [...copies.old, copies.current].filter((copy) => copy && copy !== id);
        copies.current = id;

        if (map.getLayer(id)) {
          map.moveLayer(id, getLayerAbove(layer));
        } else {
          if (!map.getSource(id)) {
            map.addSource(id, resolveSource(configuration.sources[layer.source], date));
          }

          map.addLayer({ ...layer, id, source: id }, getLayerAbove(layer));
        }
      }

      if (map.getLayer(copies.current)) {
        map.setLayoutProperty(copies.current, 'visibility', copies.isShown ? 'visible' : 'none');
      }

      // Only a raster covers the one under it. Other layers would show two days at once.
      if (!copies.isShown || layer.type !== 'raster') {
        removeOld(layer.id);
      }
    }
  }

  return {
    show,
    removeOld: () => removeOld(),

    // Whether copies for earlier days are still on the map: under the copy that has
    // this source, or under any.
    hasOld(sourceId) {
      return [...copiesOfLayers.values()].some((copies) => copies.old.length && (!sourceId || copies.current === sourceId));
    },

    // A new base map takes the copies with it.
    clear() {
      for (const copies of copiesOfLayers.values()) {
        Object.assign(copies, { current: null, old: [], isShown: false });
      }
    }
  };
}
