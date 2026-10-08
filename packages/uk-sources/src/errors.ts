/** Base error for any UK data source client in this package. */
export class UkSourceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'UkSourceError';
  }
}

/** Extra detail carried by an API error. */
export interface UkSourceApiErrorDetails extends ErrorOptions {
  /** HTTP status code, when the failure arrived as a response. */
  status?: number | undefined;
  /** Whether retrying the same request could succeed. */
  retryable?: boolean | undefined;
}

/** The remote API rejected the request (HTTP error or bad payload). */
export class UkSourceApiError extends UkSourceError {
  /** HTTP status code, when the failure arrived as a response. */
  readonly status: number | undefined;
  /** Whether retrying the same request could succeed. */
  readonly retryable: boolean;

  constructor(source: string, message: string, details: UkSourceApiErrorDetails = {}) {
    super(`${source}: ${message}`, details);
    this.name = 'UkSourceApiError';
    this.status = details.status;
    this.retryable = details.retryable ?? false;
  }
}

/** The remote payload did not match the expected shape. */
export class UkSourceParseError extends UkSourceError {
  constructor(
    public readonly source: string,
    message: string,
    options?: ErrorOptions
  ) {
    super(`${source}: ${message}`, options);
    this.name = 'UkSourceParseError';
  }
}
