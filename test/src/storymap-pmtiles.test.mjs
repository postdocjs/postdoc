import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectPMTilesSources, createPMTilesHandler } from '../../client/storymap/pmtiles.js';

test('discovers archives inside an inline basemap as well as overlays', () => {
  const source = { type: 'raster', url: 'pmtiles://https://example.org/relief.pmtiles' };
  assert.deepEqual(collectPMTilesSources({ style: { version: 8, sources: { relief: source } }, sources: { buoy: { type: 'geojson' } } }), { relief: source, buoy: { type: 'geojson' } });
});
test('empty rasters finish with a PNG; vector emptiness and metadata remain intact', async () => {
  const raster = 'pmtiles://https://example.org/relief.pmtiles';
  const archives = new Map([[raster, { type: 'raster' }]]);
  for (const data of [undefined, new Uint8Array()]) {
    const response = { data };
    const handler = createPMTilesHandler({ tile: async () => response }, archives);
    const result = await handler({ url: raster + '/5/1/2', type: 'image' });
    assert.deepEqual([...result.data.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(await handler({ url: raster, type: 'json' }), response);
    assert.equal(await handler({ url: 'pmtiles://https://example.org/vector.pmtiles/5/1/2', type: 'arrayBuffer' }), response);
  }
});
test('survey gaps request parent tiles; available data and real errors pass through', async () => {
  const url = 'pmtiles://https://example.org/survey.pmtiles';
  const archives = new Map([[url, { type: 'raster', overzoom: true }]]);
  const params = { url: url + '/12/1/2', type: 'image' };
  await assert.rejects(createPMTilesHandler({ tile: async () => ({ data: new Uint8Array() }) }, archives)(params), { status: 404 });
  const data = { data: new Uint8Array([1, 2]) };
  assert.equal(await createPMTilesHandler({ tile: async () => data }, archives)(params), data);
  const failure = Object.assign(new Error('Unavailable'), { status: 503 });
  await assert.rejects(createPMTilesHandler({ tile: async () => { throw failure } }, archives)(params), failure);
});
