/**
 * Errors whose message is fixed text written by this package. They never contain fetched content, because tool errors are
 * shown to a model and fetched content is untrusted.
 */
export type SourceErrorCode =
  | 'not_found'
  | 'http_status'
  | 'too_large'
  | 'timeout'
  | 'redirect_refused'
  | 'network'
  | 'invalid_json'
  | 'invalid_envelope'
  | 'unsupported_api_version'
  | 'invalid_data';

export class SourceError extends Error {
  readonly code: SourceErrorCode;
  constructor(code: SourceErrorCode, message: string) {
    super(message);
    this.name = 'SourceError';
    this.code = code;
  }
}

/** A mistake by whoever started the server (bad flags). Shown on stderr at start-up. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** A caller mistake that is not a schema failure (for example an unknown slug). Safe to show to the model. */
export class ToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolInputError';
  }
}
