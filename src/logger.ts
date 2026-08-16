import pino, { type DestinationStream } from "pino";

type LogFields = Record<string, unknown>;

export interface AppLogger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  fatal(message: string, fields?: LogFields): void;
}

export function createLogger(destination?: DestinationStream): AppLogger {
  const options = {
    level: process.env.LOG_LEVEL ?? "info",
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label: string) => ({ level: label }) },
    serializers: {
      error: pino.stdSerializers.err,
      notificationError: pino.stdSerializers.err,
    },
  };
  const base = destination ? pino(options, destination) : pino(options);
  return {
    debug: (message, fields = {}) => base.debug(fields, message),
    info: (message, fields = {}) => base.info(fields, message),
    warn: (message, fields = {}) => base.warn(fields, message),
    error: (message, fields = {}) => base.error(fields, message),
    fatal: (message, fields = {}) => base.fatal(fields, message),
  };
}

export const logger = createLogger();
