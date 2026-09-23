/** Base error for any UK data source client in this package. */
export class UkSourceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'UkSourceError';
  }
}

/** The remote API rejected the request (HTTP error or bad payload). */
export class UkSourceApiError extends UkSourceError {
  constructor(
    public readonly source: string,
    message: string,
    options?: ErrorOptions
  ) {
    super(`${source}: ${message}`, options);
    this.name = 'UkSourceApiError';
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
