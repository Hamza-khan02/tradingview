import dotenv from "dotenv";
dotenv.config();
const LOG_LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};
const getLogLevel = () => {
    const envLevel = process.env.LOG_LEVEL?.toLowerCase();
    if (envLevel && envLevel in LOG_LEVELS) {
        return LOG_LEVELS[envLevel];
    }
    return LOG_LEVELS.info; // Default to info
};
const currentLevel = getLogLevel();
const formatMessage = (level, message, meta) => {
    const timestamp = new Date().toISOString();
    const metaString = meta ? ` ${JSON.stringify(meta)}` : "";
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaString}`;
};
export const logger = {
    debug: (message, meta) => {
        if (currentLevel <= LOG_LEVELS.debug) {
            console.error(formatMessage("debug", message, meta));
        }
    },
    info: (message, meta) => {
        if (currentLevel <= LOG_LEVELS.info) {
            console.error(formatMessage("info", message, meta));
        }
    },
    warn: (message, meta) => {
        if (currentLevel <= LOG_LEVELS.warn) {
            console.error(formatMessage("warn", message, meta));
        }
    },
    error: (message, meta) => {
        if (currentLevel <= LOG_LEVELS.error) {
            console.error(formatMessage("error", message, meta));
        }
    },
};
