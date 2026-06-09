export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type LogFields = Record<string, unknown>

/**
 * The logging contract every Tango package writes to. Apps provide their own
 * implementation (pino, platform loggers, ...) or use `consoleLogger()`.
 */
export interface Logger {
  debug(message: string, fields?: LogFields): void
  info(message: string, fields?: LogFields): void
  warn(message: string, fields?: LogFields): void
  error(message: string, fields?: LogFields): void
}

function line(level: LogLevel, message: string, fields?: LogFields): string {
  return JSON.stringify({
    level,
    time: new Date().toISOString(),
    message,
    ...fields
  })
}

/**
 * Structured JSON-lines logger on the console. One line per event so log
 * aggregators (CloudWatch, Datadog, ...) can parse fields without a custom
 * pipeline. `warn`/`error` go to stderr.
 */
export function consoleLogger(): Logger {
  return {
    debug(message, fields) {
      console.debug(line('debug', message, fields))
    },
    info(message, fields) {
      console.info(line('info', message, fields))
    },
    warn(message, fields) {
      console.warn(line('warn', message, fields))
    },
    error(message, fields) {
      console.error(line('error', message, fields))
    }
  }
}

/** Serialize an unknown thrown value into loggable fields. */
export function errorFields(err: unknown): LogFields {
  if (err instanceof Error) {
    return {
      error: err.message,
      errorName: err.name,
      ...(err.stack === undefined ? {} : { stack: err.stack })
    }
  }
  return { error: String(err) }
}
