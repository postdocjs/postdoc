// The settings of postdoc.config.js. Every one is optional: PostDoc has a default for each.

import type { UserConfig } from 'vite';
import type { MarkedExtension, MarkedOptions } from 'marked';
import type { PagefindServiceConfig } from 'pagefind';

/** The Vite settings that PostDoc passes on. */
export type ViteConfig = Pick<UserConfig, 'logLevel' | 'plugins' | 'root' | 'server'> & {
  /** Replaces `directories.vitePublic`. */
  publicDir?: string | null;
};

export interface SessionConfig {
  /** Loads every page with a full reload, instead of replacing the page in place. */
  disable_spa?: boolean;
  /** Fetches a page when a link to it is hovered, before it's clicked. */
  enable_prefetch?: boolean;
}

export interface PWAWorkboxConfig {
  globPatterns?: string[];
  navigateFallback?: string | null;
  [key: string]: unknown;
}

/** The options of vite-plugin-pwa, which has to be installed to turn this on. */
export interface PWAConfig {
  enabled?: boolean;
  strategies?: 'generateSW' | 'injectManifest';
  registerType?: 'prompt' | 'autoUpdate';
  /** The web app manifest, or `false` for none. */
  manifest?: Record<string, unknown> | false;
  workbox?: PWAWorkboxConfig;
  [key: string]: unknown;
}

/** Relative to `baseDir`. */
export interface DirectoryConfig {
  layouts?: string;
  includes?: string;
  vitePublic?: string;
  /** @deprecated Use `contentPath`. */
  content?: string;
  /** @deprecated Use `outputPath`. */
  output?: string;
  /** @deprecated Use `testsPath`. */
  tests?: string | string[];
}

export interface APIDocsConfig {
  tags?: Record<string, unknown>;
  /** The folder of the JavaScript files to document, or `null` for none. */
  source?: string | null;
  layoutName?: string;
  /** @deprecated Use `layoutName`. */
  layout?: string;
  /** Makes pages only of the files with a `@name` comment. Defaults to `false`. */
  requireName?: boolean;
  createUrl?: (filePath: string) => string;
}

export interface IgnoreConfig {
  pages?: string[];
  apidocs?: string[];
  layouts?: string[];
}

export interface CheckConfig {
  /** Paths of the site that another site serves, such as `'/blog/**'`. Links to them aren't checked. */
  ignoreLinks?: string[];
}

export interface LoggerConfig {
  quiet?: boolean;
  verbose?: boolean;
  /** Prints without colours. The `NO_COLOR` environment variable sets it too. */
  noColors?: boolean;
}

export interface PagefindConfig {
  enabled?: boolean;
  options?: PagefindServiceConfig;
  /** Relative to the build's output directory. Defaults to `pagefind`. */
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
  /** The Nightwatch environment, or a list of them. Defaults to `chrome`. */
  browser?: string | string[];
  watch?: boolean;
  parallel?: boolean;
  /** Your own Nightwatch configuration file, in place of PostDoc's. */
  config?: string;
  pageChecks?: PageChecksConfig | false;
}

/** A link or a section in the default theme's navigation. */
export interface NavItem {
  title: string;
  /** The page it leads to. A section with `children` can have one too, listed first in it. */
  url?: string;
  children?: NavItem[];
}

/** A version of the site, in the default theme's versions menu. */
export interface SiteVersion {
  title: string;
  url: string;
  /** The version that the site is, which names the menu. */
  current?: boolean;
}

export interface AppSettings {
  /** Defaults to the `name` in package.json. */
  name?: string;
  version?: string;
  /** An image for the default theme's header, in place of the site's name. */
  logo?: string;
  /** The default theme's links in the header and the footer. */
  headerNav?: NavItem[];
  /** The default theme's sidebar on the guide pages, in sections. */
  nav?: NavItem[];
  /** The default theme's sidebar on the API reference pages. */
  apiNav?: NavItem[];
  /**
   * The repository, for the default theme's link to it: `'owner/repo'`, its address, or
   * an object. With a `branch`, every page gets a link to edit it. `dir` is the project's
   * folder in the repository, when it isn't at the top.
   */
  github?: string | { repo: string; branch?: string; dir?: string };
  /**
   * The repository and branch that the pages are in, for the default theme's link to edit
   * each page, when they differ from `github`. `false` leaves the link out.
   */
  editLink?: false | { repo: string; branch: string; dir?: string };
  /** The default theme's versions menu. */
  versions?: SiteVersion[];
  [key: string]: any;
}

/** PostDoc's Markdown switches, and the options of marked. */
export interface MarkdownOptions extends MarkedOptions {
  useCodeGroups?: boolean;
  useTables?: boolean;
  useAlertContainers?: boolean;
  useMermaid?: boolean;
  useStorymaps?: boolean;
  usePlaygrounds?: boolean;
  useNotebooks?: boolean;
  useMathExpressions?: boolean;
  /** Ids for the headings, with this prefix. `false` leaves them out. */
  gfmHeadingId?: { prefix?: string } | false;
  /** @deprecated Use `markdown.syntaxHighlight`. */
  syntaxHighlight?: MarkdownSyntaxHighlight | false;
}

export interface MarkdownSyntaxHighlight {
  /** Shiki themes. Defaults to `github-light-high-contrast` and `github-dark-high-contrast`. */
  theme?: {
    light?: string;
    dark?: string;
  };
}

export interface MarkdownConfig {
  options?: MarkdownOptions;
  /** `false` turns highlighting off. */
  syntaxHighlight?: MarkdownSyntaxHighlight | false;
  /** marked extensions, which are added after PostDoc's own. */
  extensions?: MarkedExtension[];
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
  /** The tests' folder, or a list of them. */
  testsPath?: string | string[];
  outputPath?: string;
  vite?: ViteConfig;
  session?: SessionConfig;
  pwa?: PWAConfig;
  directories?: DirectoryConfig;
  /** `false` turns API pages off. */
  apidocs?: APIDocsConfig | false;
  ignore?: IgnoreConfig;
  check?: CheckConfig;
  logger?: LoggerConfig;
  nightwatch?: NightwatchConfig;
  pagefind?: PagefindConfig;
  llms?: LlmsConfig;
  appSettings?: AppSettings;
  storymap?: StorymapConfig;
  markdown?: MarkdownConfig;
}
