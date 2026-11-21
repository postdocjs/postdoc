// Sparse raster archives need a decoded transparent image to finish loading.
// Sources listed in pmtiles.overzoom use a 404 to let MapLibre find a parent tile.
const TRANSPARENT_PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNgYGBgAAAABQABeqhXUAAAAABJRU5ErkJggg=='),
  (character) => character.charCodeAt(0)
);

export function collectPMTilesSources(configuration) {
  const style = configuration.style ?? {};
  const styles = style.version ? [style] : [style.light, style.dark];

  return Object.assign({}, ...styles.map((value) => value?.sources ?? {}), configuration.sources);
}

export function createPMTilesHandler(protocol, archives) {
  return async (params, controller) => {
    const result = await protocol.tile(params, controller);
    if (params.type === 'json' || result?.data?.byteLength > 0) {
      return result;
    }
    const archive = [...archives].find(([url]) => params.url.startsWith(`${url}/`))?.[1];
    if (archive?.type !== 'raster') {
      return result;
    }
    if (archive.overzoom) {
      throw Object.assign(new Error('Tile absent; use the parent tile'), { status: 404 });
    }

    return { ...result, data: TRANSPARENT_PNG };
  };
}
