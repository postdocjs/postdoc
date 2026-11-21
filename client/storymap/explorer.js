/** Layer choices and a modal map view share the story's map and loaded sources. */
// The room the open layer menu leaves above the credits of the map, and the least height
// of its choices, one row of them, which scroll on a short map.
const MENU_GAP = 10;
const MIN_CHOICES_HEIGHT = 44;

const overlayAvailable = (overlay, basemap) => !overlay.basemaps || overlay.basemaps.includes(basemap);

export function layerChoices(configuration, basemap, enabled) {
  const choices = configuration.basemaps?.options ?? [];
  const selected = new Set(choices.find(option => option.id === basemap)?.layers ?? []);
  const visibility = new Map(choices.flatMap(option => option.layers).map(id => [id, selected.has(id)]));
  for (const overlay of configuration.overlays ?? []) {
    const visible = enabled.has(overlay.id) && overlayAvailable(overlay, basemap);
    for (const id of overlay.layers) {visibility.set(id, visible)}
  }

  return visibility;
}

export function addExplorer(storymap, resume) {
  const { map, element, container, configuration } = storymap;
  const options = configuration.basemaps?.options ?? [];
  const overlays = configuration.overlays ?? [];
  if (!options.length && !overlays.length && !configuration.controls?.expand) {return}

  const events = new AbortController();
  const listen = (node, type, fn) => node.addEventListener(type, fn, { signal: events.signal });
  const make = (tag, className, text) => Object.assign(document.createElement(tag), { className, ...(text && { textContent: text }) });
  const panel = make('div', 'maplibregl-ctrl storymap-map-tools');
  const overlayLabels = new Map();
  let basemap = configuration.basemaps?.default ?? options[0]?.id;
  const enabled = new Set(overlays.filter(overlay => overlay.visible !== false).map(overlay => overlay.id));
  const apply = () => {
    if (storymap.isStyleChanging) {return}
    for (const [id, visible] of layerChoices(configuration, basemap, enabled)) {
      const value = visible ? 'visible' : 'none';
      if (map.getLayer(id) && map.getLayoutProperty(id, 'visibility') !== value) {map.setLayoutProperty(id, 'visibility', value)}
    }
    element.dataset.basemap = basemap ?? '';
    element.dataset.overlays = overlays.filter(overlay => enabled.has(overlay.id) && overlayAvailable(overlay, basemap))
      .map(overlay => overlay.id).join(' ');
    for (const overlay of overlays) {
      const label = overlayLabels.get(overlay.id);
      if (label) {label.hidden = !overlayAvailable(overlay, basemap)}
    }
  };

  // On a short map, the open menu would reach the credits in the map's bottom corner, and
  // cover them or be covered by them. Its choices scroll in the room above them instead.
  const details = make('details', 'storymap-layer-menu');
  const choices = make('div', 'storymap-layer-choices');
  const corner = map.getContainer().querySelector('.maplibregl-ctrl-bottom-right');
  const fitMenu = () => {
    if (!details.open) {return}
    const bottom = corner?.offsetHeight ? corner.getBoundingClientRect().top : map.getContainer().getBoundingClientRect().bottom;
    choices.style.maxHeight = `${Math.max(MIN_CHOICES_HEIGHT, bottom - choices.getBoundingClientRect().top - MENU_GAP)}px`;
  };
  const cornerObserver = new ResizeObserver(fitMenu);

  if (options.length || overlays.length) {
    details.append(make('summary', '', 'Map layers'), choices);
    listen(details, 'toggle', fitMenu);
    map.on('resize', fitMenu);
    if (corner) {cornerObserver.observe(corner)}
    if (options.length) {
      const label = make('label', 'storymap-basemap-label', 'Basemap');
      const select = make('select', '');
      select.setAttribute('aria-label', 'Basemap');
      for (const option of options) {select.append(new Option(option.label, option.id))}
      select.value = basemap;
      listen(select, 'change', () => { basemap = select.value; apply() });
      label.append(select);
      choices.append(label);
    }
    for (const overlay of overlays) {
      const label = make('label', 'storymap-overlay-label');
      overlayLabels.set(overlay.id, label);
      const input = make('input', '');
      input.type = 'checkbox';
      input.checked = enabled.has(overlay.id);
      listen(input, 'change', () => {
        if (input.checked) {enabled.add(overlay.id)} else {enabled.delete(overlay.id)}
        apply();
      });
      label.append(input, document.createTextNode(overlay.label));
      choices.append(label);
    }
    panel.append(details);
  }

  const dialog = make('dialog', 'storymap-explorer');
  dialog.setAttribute('aria-label', 'Expanded map');
  const header = make('div', 'storymap-explorer-header');
  header.append(make('strong', '', 'Explore the map'));
  const close = make('button', '', 'Back to story');
  close.type = 'button';
  header.append(close);
  dialog.append(header);
  element.append(dialog);
  let placeholder;
  let previousOverflow;
  let previousFocus;
  let previousCooperation;
  let toolDock;
  const restore = (follow = true) => {
    if (!placeholder) {return}
    placeholder.replaceWith(container);
    placeholder = null;
    toolDock?.append(panel);
    document.body.style.overflow = previousOverflow;
    storymap.explorerOpen = false;
    map.cooperativeGestures[previousCooperation ? 'enable' : 'disable']();
    map.resize();
    if (follow) {resume()}
    previousFocus?.focus({ preventScroll: true });
  };
  listen(close, 'click', () => dialog.close());
  listen(dialog, 'close', () => restore());
  if (configuration.controls?.expand) {
    const expand = make('button', 'storymap-expand', 'Expand map ↗');
    expand.type = 'button';
    listen(expand, 'click', () => {
      previousFocus = document.activeElement;
      previousOverflow = document.body.style.overflow;
      previousCooperation = map.cooperativeGestures.isEnabled();
      const camera = { center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() };
      placeholder = make('div', 'storymap-map-placeholder');
      placeholder.style.height = `${container.getBoundingClientRect().height}px`;
      container.replaceWith(placeholder);
      storymap.explorerOpen = true;
      map.stop();
      controlPosition.append(panel);
      dialog.append(container);
      dialog.showModal();
      document.body.style.overflow = 'hidden';
      map.cooperativeGestures.disable();
      map.setPadding({ top: 0, right: 0, bottom: 0, left: 0 });
      map.resize();
      map.jumpTo(camera);
      map.getCanvas().setAttribute('aria-label', 'Interactive expanded map');
      close.focus();
    });
    panel.prepend(expand);
  }
  const control = { onAdd: () => panel, onRemove: () => panel.remove() };
  map.addControl(control, 'top-right');
  const controlPosition = panel.parentElement;
  if (storymap.isFloating) {
    // A sticky map creates a stacking context below the chapter cards. Keep its
    // explorer controls in a separate sticky dock so cards cannot cover them.
    toolDock = make('div', 'storymap-floating-tools');
    container.before(toolDock);
    toolDock.append(panel);
  }
  map.on('idle', apply);
  apply();

  return () => {
    events.abort();
    cornerObserver.disconnect();
    map.off('resize', fitMenu);
    restore(false);
    dialog.remove();
    toolDock?.remove();
    map.off('idle', apply);
    map.removeControl(control);
  };
}
