// postdoc/client: the session that loads the pages of the site in place.

/** Which pages a callback is for: a pattern of their address, or a test of it. */
export type PageMatcher = RegExp | ((url: URL) => boolean);

export interface Navigator {
  readonly currentUrl: URL;
  navigateTo(url: string | URL, scrollPosition?: number, changeState?: boolean): Promise<void>;
  reload(): void;
  registerOnRenderCallback(callback: (url: URL) => unknown, options?: { forPage?: PageMatcher; index?: number }): void;
  registerOnLeaveCallback(callback: (url: URL, nextUrl: URL) => unknown, options?: { forPage?: PageMatcher }): void;
}

/** The settings that the page ships to the browser. */
export interface ClientConfiguration {
  /** The path the site is served from, such as `/` or `/docs/`. */
  base: string;
  session?: {
    disable_spa?: boolean;
    enable_prefetch?: boolean;
  };
  pagefind?: {
    outputDir?: string;
  };
}

export interface Session {
  readonly navigator: Navigator;
  configuration: ClientConfiguration;
  init(): void;
}

export const session: Session;
