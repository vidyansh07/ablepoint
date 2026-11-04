/**
 * Logging goes to stderr only: stdout is the MCP channel. Messages are fixed codes and resource or tool names. They never
 * contain request arguments, fetched content, URLs with credentials, or personal data.
 */
export type LogSink = (line: string) => void;

export interface Logger {
  info(event: string, fields?: Record<string, string | number | boolean>): void;
  error(event: string, fields?: Record<string, string | number | boolean>): void;
}

const SAFE_VALUE = /^[A-Za-z0-9_.:\-/]{0,80}$/;

export function createLogger(sink: LogSink = (line) => process.stderr.write(line)): Logger {
  const write = (level: string, event: string, fields: Record<string, string | number | boolean> = {}) => {
    const parts = [`ablepoint-mcp ${level} ${event}`];
    for (const [k, v] of Object.entries(fields)) {
      const s = String(v);
      parts.push(`${k}=${SAFE_VALUE.test(s) ? s : '[redacted]'}`);
    }
    sink(parts.join(' ') + '\n');
  };
  return { info: (e, f) => write('info', e, f), error: (e, f) => write('error', e, f) };
}

export const silentLogger: Logger = { info() {}, error() {} };
