/** What a UK source needs before it will answer a request. */
export type UkSourceAuth = 'none' | 'key';

/** Options shared by every adapter's live fetch. */
export interface UkFetchOptions {
  apiKey?: string;
  fetchImpl?: typeof globalThis.fetch;
}

/**
 * One UK data source behind a uniform interface: a live fetch, a strict
 * parse, and a committed fixture fallback so builds work offline.
 */
export interface UkDataAdapter<T> {
  readonly id: string;
  readonly name: string;
  readonly auth: UkSourceAuth;
  readonly description: string;
  fetchLive(options?: UkFetchOptions): Promise<T>;
  parse(payload: unknown): T;
  loadFixture(): T;
}

/** Result of a live verification probe against one source. */
export interface UkSourceProbe {
  id: string;
  name: string;
  auth: UkSourceAuth;
  ok: boolean;
  status: string;
  sample?: string;
}
