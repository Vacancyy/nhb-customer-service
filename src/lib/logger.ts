// 系统日志配置 - Winston + Daily Rotate File

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

// 设置时区为中国时区
process.env.TZ = 'Asia/Shanghai';

// 日志目录
const LOG_DIR = process.env.LOG_DIR || path.join(process.cwd(), 'logs');

// 日志级别
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// 按日期分割的文件传输
const dailyRotateFileTransport = new DailyRotateFile({
  filename: path.join(LOG_DIR, 'nhb-customer-service.%DATE%'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: false,
  maxSize: '5m',           // 单文件最大 5MB
  maxFiles: '30d',         // 保留 30 天
  extension: '.log',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ level, message, timestamp, ...meta }) => {
      const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
      return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`;
    })
  ),
});

// 创建日志实例
export const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ level, message, timestamp, stack, ...meta }) => {
      const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
      if (stack) {
        return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}\n${stack}`;
      }
      return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`;
    })
  ),
  transports: [dailyRotateFileTransport],
});

// 开发环境：同时输出到控制台
if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message, timestamp, ...meta }) => {
          const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
          return `[${timestamp}] ${level}: ${message}${metaStr}`;
        })
      ),
    })
  );
}

// 便捷方法
export const logInfo = (message: string, meta?: any) => logger.info(message, meta);
export const logError = (message: string, meta?: any) => logger.error(message, meta);
export const logWarn = (message: string, meta?: any) => logger.warn(message, meta);
export const logDebug = (message: string, meta?: any) => logger.debug(message, meta);