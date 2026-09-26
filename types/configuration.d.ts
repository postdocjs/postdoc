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

export interface NightwatchConfig {
  headless?: boolean;
  browser?: string;
  watch?: boolean;
}

export interface AppSettings {
  [key: string]: any;
}

export interface MarkdownOptions {
  async?: boolean;
  useCodeGroups?: boolean;
  useTables?: boolean;
  useAlertContainers?: boolean;
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

export interface PostdocConfig {
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
  appSettings?: AppSettings;
  markdown?: MarkdownConfig;
}
