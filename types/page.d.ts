// postdoc/page: code for every page, as the site changes pages without a reload.

import type { PageMatcher } from './client.js';

export type { PageMatcher };

export interface RenderOptions {
  /**
   * The pages the callback runs on. Without it, only the page that the script was first
   * loaded on, as a script runs once.
   */
  forPage?: PageMatcher;
  /** The order of the callbacks, lowest first. */
  index?: number;
}

export interface LeaveOptions {
  /** The pages the callback runs on when they're left. */
  forPage?: PageMatcher;
}

/** Shows another page of the site, as a link to it would. */
export function navigateTo(url: string | URL): Promise<void>;

/**
 * Runs the callback when a page has been shown, and at once for the page that's open.
 * PostDoc waits for a promise it returns before it calls the page ready.
 */
export function onRender(callback: (url: URL) => unknown, options?: RenderOptions): void;

/** Runs the callback before a page is left for another one. */
export function onLeave(callback: (url: URL, nextUrl: URL) => unknown, options?: LeaveOptions): void;
