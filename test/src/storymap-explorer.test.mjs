import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layerChoices } from '../../client/storymap/explorer.js';

const configuration = {
  basemaps: { options: [
    { id: 'streets', layers: ['osm', 'shared-labels'] },
    { id: 'imagery', layers: ['esri', 'shared-labels'] },
    { id: 'ocean', layers: ['land'] }
  ] },
  overlays: [{ id: 'depths', layers: ['regional', 'local'] }]
};

test('switching backgrounds retains shared labels and independent overlays', () => {
  const visibility = layerChoices(configuration, 'imagery', new Set(['depths']));
  assert.equal(visibility.get('osm'), false);
  assert.equal(visibility.get('esri'), true);
  assert.equal(visibility.get('shared-labels'), true);
  assert.equal(visibility.get('regional'), true);
  assert.equal(visibility.has('observation-marker'), false);
});

test('turning bathymetry off leaves the selected background available', () => {
  const visibility = layerChoices(configuration, 'streets', new Set());
  assert.equal(visibility.get('osm'), true);
  assert.equal(visibility.get('local'), false);
  assert.equal(visibility.get('regional'), false);
});

test('restricted overlays stay off on imagery and return to their previous setting on other basemaps', () => {
  const restricted = { ...configuration, overlays: [
    { id: 'depths', layers: ['regional', 'local'], basemaps: ['streets', 'ocean'] }
  ] };
  const enabled = new Set(['depths']);
  assert.equal(layerChoices(restricted, 'streets', enabled).get('regional'), true);
  const imagery = layerChoices(restricted, 'imagery', enabled);
  assert.equal(imagery.get('esri'), true);
  assert.equal(imagery.get('regional'), false);
  assert.equal(imagery.get('local'), false);
  assert.equal(layerChoices(restricted, 'ocean', enabled).get('regional'), true);
  assert.equal(layerChoices(restricted, 'streets', new Set()).get('regional'), false);
});
