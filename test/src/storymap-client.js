import assert from 'node:assert/strict';
import { formatTemplate } from '../../client/storymap/overlays.js';
import { createDatedLayers, isDated, resolveDates, setDate } from '../../client/storymap/dated.js';
import { countMoments, getMarkers, getMoments, getTime, getTimeClauses } from '../../client/storymap/timeline.js';

describe('Storymap client', function () {
  const track = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { time: '2023-06-22T06:00:00Z' }, geometry: { type: 'LineString', coordinates: [[-155, 18], [-155, 17]] } },
      { type: 'Feature', properties: { time: '2023-06-21T18:00:00Z' }, geometry: { type: 'Point', coordinates: [-155, 18.1] } },
      { type: 'Feature', properties: { time: '2023-06-22T00:00:00Z' }, geometry: { type: 'LineString', coordinates: [[-155, 18.1], [-155, 18]] } },
      { type: 'Feature', properties: { name: 'No time' }, geometry: { type: 'Point', coordinates: [0, 0] } },
      { type: 'Feature', properties: { time: '2023-06-23T00:00:00Z' }, geometry: { type: 'Polygon', coordinates: [] } }
    ]
  };

  test('should keep the features of a timeline within the time of a step', function () {
    const timeline = { property: 'when' };

    assert.deepEqual(getTimeClauses(timeline, {}), []);
    // A date without a time includes the whole day.
    assert.deepEqual(getTimeClauses(timeline, { from: '2023-07-17', until: '2023-09-12' }), [
      ['>=', ['get', 'when'], '2023-07-17'],
      ['<=', ['get', 'when'], '2023-09-12T23:59:59.999Z']
    ]);
    // While the time runs, it is where the time has got to.
    assert.deepEqual(getTimeClauses({}, { until: '2023-09-12' }, '2023-08-01T10:00:00.000Z'), [
      ['<=', ['get', 'time'], '2023-08-01T10:00:00.000Z']
    ]);
  });

  test('should show all of a timeline at a step without an until', function () {
    assert.equal(getTime({}), Infinity);
    assert.equal(getTime({ until: '2023-06-22' }), Date.parse('2023-06-22T23:59:59.999Z'));
    assert.equal(getTime({ until: '2023-06-22T06:00:00Z' }), Date.parse('2023-06-22T06:00:00Z'));
  });

  test('should read where a track had got to at each time', function () {
    const moments = getMoments(track);

    // In order, at the end of each line, without the features that have no time or no position.
    assert.deepEqual(moments.map((moment) => moment.position), [[-155, 18.1], [-155, 18], [-155, 17]]);

    assert.equal(countMoments(moments, Date.parse('2023-06-21T00:00:00Z')), 0);
    assert.equal(countMoments(moments, Date.parse('2023-06-22T00:00:00Z')), 2);
    assert.equal(countMoments(moments, Date.parse('2023-06-22T05:59:59Z')), 2);
    assert.equal(countMoments(moments, Infinity), 3);
  });

  test('should read the track of one vessel among several', function () {
    const tracks = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { drone: 'SD1030', time: '2023-06-22T00:00:00Z' }, geometry: { type: 'LineString', coordinates: [[-155.1, 18.1], [-155.1, 18]] } },
        { type: 'Feature', properties: { drone: 'SD1033', time: '2023-06-22T00:00:00Z' }, geometry: { type: 'LineString', coordinates: [[-154.9, 18.1], [-154.9, 18]] } },
        { type: 'Feature', properties: { drone: 'SD1030', time: '2023-06-22T03:00:00Z' }, geometry: { type: 'LineString', coordinates: [[-155.1, 18], [-155.1, 17.9]] } }
      ]
    };

    assert.equal(getMoments(tracks).length, 3);
    assert.deepEqual(getMoments(tracks, 'time', { drone: 'SD1030' }).map((moment) => moment.position), [[-155.1, 18], [-155.1, 17.9]]);
    assert.deepEqual(getMoments(tracks, 'time', { drone: 'SD1079' }), []);
  });

  test('should read the markers of a timeline', function () {
    assert.deepEqual(getMarkers({}), []);
    assert.deepEqual(getMarkers({ marker: false }), []);
    // One marker at the head of the timeline, or one that follows another source.
    assert.deepEqual(getMarkers({ marker: true }), [{}]);
    assert.deepEqual(getMarkers({ marker: 'positions' }), [{ source: 'positions' }]);
    assert.deepEqual(getMarkers({ marker: { label: 'SD1030' } }), [{ label: 'SD1030' }]);
    assert.deepEqual(getMarkers({ marker: [{ where: { drone: 'SD1030' } }, 'positions', true] }), [
      { where: { drone: 'SD1030' } },
      { source: 'positions' },
      {}
    ]);
  });

  test('should show a dated source for the date of each step', function () {
    const tiles = 'https://tiles.example/sst/{date}/{z}/{x}/{y}.png';

    assert.equal(isDated({ type: 'raster', tiles: [tiles] }), true);
    assert.equal(isDated({ type: 'raster', url: 'https://tiles.example/sst/{date}.json' }), true);
    assert.equal(isDated({ type: 'geojson', data: '/data/fronts-{date}.geojson' }), true);
    assert.equal(isDated({ type: 'geojson', data: { type: 'FeatureCollection', features: [] } }), false);
    assert.equal(isDated({ type: 'raster', tiles: ['https://tiles.example/{z}/{x}/{y}.png'] }), false);
    assert.equal(isDated(undefined), false);

    // The tile coordinates are left for MapLibre.
    assert.equal(setDate(tiles, '2023-07-17'), 'https://tiles.example/sst/2023-07-17/{z}/{x}/{y}.png');
    assert.equal(setDate(tiles, undefined), tiles);

    // A step's own date, or the day of its until, or else the date of the step before it.
    // The steps before the first date have that one.
    assert.deepEqual(resolveDates([
      {},
      { until: '2023-07-17T18:00:00Z' },
      { until: '2023-09-12', date: '2023-08-31' },
      {},
      { until: '2023-11-05' }
    ]), ['2023-07-17', '2023-07-17', '2023-08-31', '2023-08-31', '2023-11-05']);
    assert.deepEqual(resolveDates([{}, { zoom: 3 }]), [undefined, undefined]);
  });

  // As much of a MapLibre map as dated layers use. `layers` has the ids from the bottom up.
  function createMap(layers) {
    const sources = new Map();
    const visibility = new Map();
    const loaded = new Set();
    const insert = (id, before) => layers.splice(before ? layers.indexOf(before) : layers.length, 0, id);

    return {
      layers,
      sources,
      visibility,
      loaded,
      getLayer: (id) => layers.includes(id) ? { id } : undefined,
      getSource: (id) => sources.get(id),
      addSource: (id, source) => sources.set(id, source),
      addLayer: (layer, before) => insert(layer.id, before),
      moveLayer(id, before) {
        layers.splice(layers.indexOf(id), 1);
        insert(id, before);
      },
      removeLayer: (id) => layers.splice(layers.indexOf(id), 1),
      removeSource: (id) => sources.delete(id),
      setLayoutProperty: (id, name, value) => visibility.set(id, value),
      isSourceLoaded: (id) => loaded.has(id)
    };
  }

  function createDatedStorymap(views, type = 'raster') {
    const configuration = {
      sources: {
        sst: { type, tiles: ['https://tiles.example/sst/{date}/{z}/{x}/{y}.png'] },
        tracks: { type: 'geojson', data: '/tracks.geojson' }
      },
      layers: [
        { id: 'sst', type: type === 'raster' ? 'raster' : 'line', source: 'sst' },
        { id: 'tracks', type: 'line', source: 'tracks' }
      ]
    };
    const map = createMap(['tracks']);
    const datedLayers = createDatedLayers({ map, configuration, views, dates: resolveDates(views) }, {
      resolveSource: (source, date) => ({ ...source, tiles: source.tiles.map((url) => setDate(url, date)) }),
      isShown: (layer, view) => !view.hide?.includes(layer.id)
    });

    return { map, datedLayers };
  }

  test('should fade a dated layer from one day into the next', function () {
    const { map, datedLayers } = createDatedStorymap([{ until: '2023-06-22' }, { until: '2023-08-10' }]);

    // Under the layers that come after it in the settings, with the tiles of its day.
    datedLayers.show(0);
    assert.deepEqual(map.layers, ['sst@2023-06-22', 'tracks']);
    assert.deepEqual(map.sources.get('sst@2023-06-22').tiles, ['https://tiles.example/sst/2023-06-22/{z}/{x}/{y}.png']);
    assert.equal(map.visibility.get('sst@2023-06-22'), 'visible');

    // The next day goes over the one before it, which stays until the new tiles are there.
    datedLayers.show(1);
    assert.deepEqual(map.layers, ['sst@2023-06-22', 'sst@2023-08-10', 'tracks']);
    assert.equal(datedLayers.hasOld('sst@2023-08-10'), true);
    assert.equal(datedLayers.hasOld('tracks'), false);

    datedLayers.removeOld();
    assert.deepEqual(map.layers, ['sst@2023-06-22', 'sst@2023-08-10', 'tracks']);

    map.loaded.add('sst@2023-08-10');
    datedLayers.removeOld();
    assert.deepEqual(map.layers, ['sst@2023-08-10', 'tracks']);
    assert.deepEqual([...map.sources.keys()], ['sst@2023-08-10']);
    assert.equal(datedLayers.hasOld(), false);
  });

  test('should use the copy of a day again when the reader scrolls back to it', function () {
    const { map, datedLayers } = createDatedStorymap([{ until: '2023-06-22' }, { until: '2023-08-10' }]);

    datedLayers.show(0);
    datedLayers.show(1);
    datedLayers.show(0);

    assert.deepEqual(map.layers, ['sst@2023-08-10', 'sst@2023-06-22', 'tracks']);
    assert.equal(map.sources.size, 2);

    map.loaded.add('sst@2023-06-22');
    datedLayers.removeOld();
    assert.deepEqual(map.layers, ['sst@2023-06-22', 'tracks']);
  });

  test('should hide a dated layer at once, and only show one day of other layers', function () {
    const views = [{ until: '2023-06-22' }, { until: '2023-08-10', hide: ['sst'] }, { until: '2023-08-10' }];
    const hidden = createDatedStorymap(views);

    hidden.datedLayers.show(0);
    hidden.datedLayers.show(1);
    assert.deepEqual(hidden.map.layers, ['sst@2023-08-10', 'tracks']);
    assert.equal(hidden.map.visibility.get('sst@2023-08-10'), 'none');

    // The same day shows again without another copy.
    hidden.datedLayers.show(2);
    assert.deepEqual(hidden.map.layers, ['sst@2023-08-10', 'tracks']);
    assert.equal(hidden.map.visibility.get('sst@2023-08-10'), 'visible');

    // Lines don't cover the lines of the day before, so those go at once.
    const lines = createDatedStorymap(views, 'vector');

    lines.datedLayers.show(0);
    lines.datedLayers.show(2);
    assert.deepEqual(lines.map.layers, ['sst@2023-08-10', 'tracks']);

    // A new base map takes the copies with it, and they're made again.
    lines.map.layers.splice(0);
    lines.map.sources.clear();
    lines.datedLayers.clear();
    lines.datedLayers.show(2);
    assert.deepEqual(lines.map.layers, ['sst@2023-08-10']);
  });

  test('should leave dated layers out of a storymap that has no dates', function () {
    const { map, datedLayers } = createDatedStorymap([{ zoom: 3 }]);

    datedLayers.show(0);
    assert.deepEqual(map.layers, ['tracks']);
    assert.equal(map.sources.size, 0);
  });

  test('should fill the text of a popup with the properties of a feature', function () {
    const properties = { name: 'TAO 8°N', time: '2023-06-30T00:00:00Z', temperature: 28.3456, depth: '<b>80</b>' };

    assert.equal(formatTemplate('{name}: {temperature|1} °C', properties, 'en'), 'TAO 8°N: 28.3 °C');
    assert.equal(formatTemplate('{time|date}', properties, 'en'), 'Jun 30, 2023');
    assert.match(formatTemplate('{time|datetime}', properties, 'en'), /^Jun 30, 2023, 12:00\sAM$/);
    // A property that the feature doesn't have is a dash, and a value is never more than text.
    assert.equal(formatTemplate('{salinity|2} / {depth}', properties, 'en'), '– / <b>80</b>');
    assert.equal(formatTemplate('{name|date}', properties, 'en'), 'TAO 8°N');
  });
});
