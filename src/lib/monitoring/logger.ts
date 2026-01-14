/**
 * Structured JSON Logger
 * P2-1 Implementation
 *
 * Provides structured JSON logging with request context support.
 * Designed for integration with log aggregation services.
 */

/**
 * Log levels supported by the logger
 */
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

/**
 * Priority order for log levels
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  [LogLevel.DEBUG]: 0,
  [LogLevel.INFO]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.ERROR]: 3,
};

/**
 * Context information that can be included in logs
 */
export interface LogContext {
  requestId?: string;
  userId?: string;
  organizationId?: string;
  [key: string]: unknown;
}

/**
 * Serialized error object
 */
interface SerializedError {
  name: string;
  message: string;
  stack?: string;
}

/**
 * Complete log entry structure
 */
interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  service: string;
  requestId?: string;
  userId?: string;
  organizationId?: string;
  error?: SerializedError;
  [key: string]: unknown;
}

/**
 * Metadata that can be passed to log methods
 */
export type LogMetadata = Record<string, unknown>;

/**
 * Logger interface
 */
export interface Logger {
  debug: (message: string, meta?: LogMetadata) => void;
  info: (message: string, meta?: LogMetadata) => void;
  warn: (message: string, meta?: LogMetadata) => void;
  error: (message: string, meta?: LogMetadata) => void;
}

/**
 * Service name for log entries
 */
const SERVICE_NAME = 'caseradar';

/**
 * Get current minimum log level from environment
 */
function getMinLogLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toUpperCase();
  if (envLevel && Object.keys(LOG_LEVEL_PRIORITY).includes(envLevel)) {
    return envLevel as LogLevel;
  }
  return LogLevel.INFO; // Default to INFO
}

/**
 * Check if a log level should be output
 */
function shouldLog(level: LogLevel): boolean {
  const minLevel = getMinLogLevel();
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[minLevel];
}

/**
 * Serialize an Error object for JSON output
 */
function serializeError(error: Error): SerializedError {
  return {
    name: error.name,
    message: error.message,
    ...(error.stack && { stack: error.stack }),
  };
}

/**
 * Create a log entry
 */
function createLogEntry(
  level: LogLevel,
  message: string,
  context: LogContext = {},
  meta: LogMetadata = {}
): LogEntry {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    service: SERVICE_NAME,
  };

  // Add context fields
  if (context.requestId) entry.requestId = context.requestId;
  if (context.userId) entry.userId = context.userId;
  if (context.organizationId) entry.organizationId = context.organizationId;

  // Add metadata fields
  for (const [key, value] of Object.entries(meta)) {
    if (key === 'error' && value instanceof Error) {
      entry.error = serializeError(value);
    } else if (!['timestamp', 'level', 'message', 'service'].includes(key)) {
      entry[key] = value;
    }
  }

  return entry;
}

/**
 * Output a log entry to the console
 */
function outputLog(level: LogLevel, entry: LogEntry): void {
  const json = JSON.stringify(entry);

  switch (level) {
    case LogLevel.ERROR:
      console.error(json);
      break;
    case LogLevel.WARN:
      console.warn(json);
      break;
    case LogLevel.DEBUG:
      console.debug(json);
      break;
    case LogLevel.INFO:
    default:
      console.log(json);
      break;
  }
}

/**
 * Create a logger with optional context
 */
function createLoggerWithContext(context: LogContext = {}): Logger {
  return {
    debug: (message: string, meta?: LogMetadata) => {
      if (shouldLog(LogLevel.DEBUG)) {
        const entry = createLogEntry(LogLevel.DEBUG, message, context, meta);
        outputLog(LogLevel.DEBUG, entry);
      }
    },
    info: (message: string, meta?: LogMetadata) => {
      if (shouldLog(LogLevel.INFO)) {
        const entry = createLogEntry(LogLevel.INFO, message, context, meta);
        outputLog(LogLevel.INFO, entry);
      }
    },
    warn: (message: string, meta?: LogMetadata) => {
      if (shouldLog(LogLevel.WARN)) {
        const entry = createLogEntry(LogLevel.WARN, message, context, meta);
        outputLog(LogLevel.WARN, entry);
      }
    },
    error: (message: string, meta?: LogMetadata) => {
      if (shouldLog(LogLevel.ERROR)) {
        const entry = createLogEntry(LogLevel.ERROR, message, context, meta);
        outputLog(LogLevel.ERROR, entry);
      }
    },
  };
}

/**
 * Default logger instance (no request context)
 */
export const logger: Logger = createLoggerWithContext();

/**
 * Create a request-scoped logger with context
 *
 * @param requestId - Unique request identifier
 * @param context - Additional context (userId, organizationId, etc.)
 * @returns Logger instance with context
 */
export function createRequestLogger(
  requestId: string,
  context: Partial<Omit<LogContext, 'requestId'>> = {}
): Logger {
  return createLoggerWithContext({
    requestId,
    ...context,
  });
}
