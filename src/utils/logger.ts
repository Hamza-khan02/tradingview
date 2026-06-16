import dotenv from "dotenv";

dotenv.config();

export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const getLogLevel = (): number => {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase() as LogLevel | undefined;
  if (envLevel && envLevel in LOG_LEVELS) {
    return LOG_LEVELS[envLevel];
  }
  return LOG_LEVELS.info; // Default to info
};

const currentLevel = getLogLevel();

const formatMessage = (level: LogLevel, message: string, meta?: Record<string, unknown>): string => {
  const timestamp = new Date().toISOString();
  const metaString = meta ? ` ${JSON.stringify(meta)}` : "";
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaString}`;
};

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>): void => {
    if (currentLevel <= LOG_LEVELS.debug) {
      console.error(formatMessage("debug", message, meta));
    }
  },
  info: (message: string, meta?: Record<string, unknown>): void => {
    if (currentLevel <= LOG_LEVELS.info) {
      console.error(formatMessage("info", message, meta));
    }
  },
  warn: (message: string, meta?: Record<string, unknown>): void => {
    if (currentLevel <= LOG_LEVELS.warn) {
      console.error(formatMessage("warn", message, meta));
    }
  },
  error: (message: string, meta?: Record<string, unknown>): void => {
    if (currentLevel <= LOG_LEVELS.error) {
      console.error(formatMessage("error", message, meta));
    }
  },
};
