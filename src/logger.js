import { config } from './config.js';

const levels = ['debug', 'info', 'warn', 'error'];

function enabled(level) {
  return levels.indexOf(level) >= levels.indexOf(config.logLevel);
}

function write(level, message, meta) {
  if (!enabled(level)) return;
  const suffix = meta ? ` ${JSON.stringify(meta)}` : '';
  console[level === 'debug' ? 'log' : level](`[${new Date().toISOString()}] ${level.toUpperCase()} ${message}${suffix}`);
}

export const logger = {
  debug: (message, meta) => write('debug', message, meta),
  info: (message, meta) => write('info', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  error: (message, meta) => write('error', message, meta),
};
