// PostdocConfig.d.ts

import {PagefindServiceConfig} from 'pagefind';

export interface ViteConfig {
  publicDir?: string;
  logLevel?: string;
}

export interface SessionConfig {
  disable_spa?: boolean;
  enable_prefetch?: boolean;
}

export interface PWAWorkboxConfig {
  globPatterns: string[];
}

export interface PWAConfig {
  enabled?: boolean;
  strategies?: string;
  registerType?: string;
  workbox?: PWAWorkboxConfig;
}

export interface DirectoryConfig {
  layouts: string;
  includes: string;
  vitePublic?: string;
}

export interface APIDocsConfig {
  tags?: Record<string, unknown>;
  source: string | null | boolean;
  layoutName: string;
  createUrl: (filePath: string) => string;
}

export interface IgnoreConfig {
  pages?: string[];
  apidocs?: string[];
  layouts?: string[];
}

export interface LoggerConfig {
  quiet?: boolean;
  verbose?: boolean;
}

export interface PagefindConfig {
  enabled: boolean;
  options?: PagefindServiceConfig;
  outputDir?: string;
}

export interface LlmsConfig {
  /** Writes llms.txt and a Markdown copy of every page. Defaults to `true`. */
  enabled?: boolean;
  /** A line about the site, at the top of llms.txt. */
  description?: string | null;
}

export interface PageChecksDarkModeConfig {
  enabled?: boolean;
  attribute?: string | null;
  value?: string;
}

export interface PageChecksA11yConfig {
  enabled?: boolean;
  context?: string;
  options?: Record<string, unknown> | null;
  darkMode?: PageChecksDarkModeConfig | boolean;
}

export interface PageChecksKeyboardConfig {
  enabled?: boolean;
  skipLink?: boolean;
  ignore?: string[];
  maxStops?: number;
}

export interface PageChecksTogglesConfig {
  enabled?: boolean;
  ignore?: string[];
  maxToggles?: number;
}

export interface PageChecksTextConfig {
  enabled?: boolean;
  spacing?: boolean;
  resize?: boolean;
  ignore?: string[];
}

export interface PageChecksNavigationConfig {
  enabled?: boolean;
}

export interface PageChecksConfig {
  enabled?: boolean;
  ignore?: string[];
  widths?: number[];
  readyTimeout?: number;
  a11y?: PageChecksA11yConfig | boolean;
  keyboard?: PageChecksKeyboardConfig | boolean;
  toggles?: PageChecksTogglesConfig | boolean;
  text?: PageChecksTextConfig | boolean;
  navigation?: PageChecksNavigationConfig | boolean;
}

export interface NightwatchConfig {
  headless?: boolean;
  browser?: string | string[];
  watch?: boolean;
  pageChecks?: PageChecksConfig | false;
}

export interface AppSettings {
  [key: string]: any;
}

export interface MarkdownOptions {
  async?: boolean;
  useCodeGroups?: boolean;
  useTables?: boolean;
  useAlertContainers?: boolean;
  useMermaid?: boolean;
  useStorymaps?: boolean;
  useMathExpressions?: boolean;
  gfmHeadingId: {
    prefix: string;
  };
}

export interface MarkdownSyntaxHighlight {
  theme: {
    light?: string;
    dark?: string;
  };
}

export interface MarkdownConfig {
  options?: MarkdownOptions;
  syntaxHighlight?: MarkdownSyntaxHighlight;
  extensions?: string[];
}

/** A marker of a storymap's timeline: where one track has got to. */
export interface StorymapMarker {
  /** The GeoJSON source that the marker follows. By default, that of the first timeline layer. */
  source?: string;
  /** The properties that the marker's features have, such as `{ vessel: 'SD1030' }`. */
  where?: Record<string, string | number | boolean>;
  /** A name beside the marker. */
  label?: string;
  /** The side of the marker that the label is on. On the right by default. */
  side?: 'left' | 'right' | 'top' | 'bottom';
  color?: string;
}

export interface StorymapLegend {
  /** A line above the colours. `{date|date}` in it shows the step's date. */
  title?: string;
  /** The layer that the legend shows with. Without it, it shows with every step. */
  layer?: string;
  /** A colour ramp: values and their colours, from the lowest to the highest. */
  stops?: [number, string][];
  /** How the values lie along the ramp: evenly, by default, or by their logarithm. */
  scale?: 'linear' | 'log';
  items?: { label: string; color: string }[];
}

/** The map settings every storymap starts with. A storymap's own replace them key by key. */
export interface StorymapConfig {
  /** A MapLibre style: its URL, a light and a dark one, or the style itself. */
  style?: string | { light?: string; dark?: string } | Record<string, any>;
  layout?: 'docked' | 'floating';
  projection?: 'mercator' | 'globe';
  controls?: {
    zoom?: boolean;
    compass?: boolean;
    scale?: boolean | 'metric' | 'imperial' | 'nautical';
  };
  /** MapLibre sources. One with `{date}` in its address is shown for the date of each step. */
  sources?: Record<string, any>;
  layers?: Record<string, any>[];
  timeline?: {
    property?: string;
    layers?: string[];
    /**
     * A marker at the head of the timeline, the source that it follows, the settings of
     * a marker, or a list of them for the tracks that share the timeline.
     */
    marker?: boolean | string | StorymapMarker | (boolean | string | StorymapMarker)[];
    animate?: boolean;
  };
  legend?: StorymapLegend | StorymapLegend[];
  /** The text of the popup of a layer, by its id, such as `'{name}: {depth|1} m'`. */
  popups?: Record<string, string>;
  /** Other options of the MapLibre map, such as `minZoom` or `maxBounds`. */
  map?: Record<string, any>;
  center?: [number, number];
  zoom?: number;
  bearing?: number;
  pitch?: number;
  bounds?: [number, number, number, number];
}

export interface PostdocConfig {
  base?: string;
  theme?: string | null;
  baseDir?: string;
  contentPath?: string;
  testsPath?: string;
  outputPath?: string;
  vite?: ViteConfig;
  session?: SessionConfig;
  pwa?: PWAConfig;
  directories?: DirectoryConfig;
  apidocs?: APIDocsConfig;
  ignore?: IgnoreConfig;
  logger?: LoggerConfig;
  nightwatch?: NightwatchConfig;
  pagefind?: PagefindConfig;
  llms?: LlmsConfig;
  appSettings?: AppSettings;
  storymap?: StorymapConfig;
  markdown?: MarkdownConfig;
}
