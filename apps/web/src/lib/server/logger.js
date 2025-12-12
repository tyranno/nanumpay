import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { promisify } from 'util';
import zlib from 'zlib';
import { pipeline } from 'stream';

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const unlink = promisify(fs.unlink);
const pipelineAsync = promisify(pipeline);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 로그 디렉토리 설정 (개발/배포 환경 모두 지원)
// 개발: apps/web/logs/, 배포: /opt/nanumpay/logs/
const logDir = path.join(process.cwd(), 'logs');

// 날짜별 로테이션 트랜스포트 설정 (1년 보관, 전체 폴더 100MB 제한)
// 모든 로그를 하나의 파일로 통합
const dailyRotateFileTransport = new DailyRotateFile({
  filename: path.join(logDir, '%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true, // 오늘 제외하고 압축
  maxSize: '10m', // 파일당 최대 10MB
  maxFiles: '365d', // 1년 보관
  auditFile: path.join(logDir, '.audit.json'),
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) => {
      return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    })
  )
});

// Winston 로거 생성
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    })
  ),
  transports: [
    dailyRotateFileTransport
  ]
});

// 개발 환경에서는 콘솔에도 출력
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// 엑셀 업로드 전용 로거 (메인 로거와 동일하게 통합)
export const excelLogger = logger;

// console.log, console.error, console.warn을 winston으로 리다이렉트
console.log = function(...args) {
  const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
  // 빈 메시지 스킵
  if (message && message.trim()) {
    logger.info(message);
  }
};

console.error = function(...args) {
  const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
  // Warning은 warn 레벨로, 실제 error만 error 레벨로
  if (message.includes('Warning:') || message.includes('[MONGOOSE]')) {
    logger.warn(message);
  } else {
    logger.error(message);
  }
};

console.warn = function(...args) {
  logger.warn(args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' '));
};

console.info = function(...args) {
  const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
  if (message && message.trim()) {
    logger.info(message);
  }
};

console.debug = function(...args) {
  logger.debug(args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' '));
};

// 서버 시작 시 압축되지 않은 오래된 로그 파일 자동 압축
async function compressOldLogs() {
  try {
    if (!fs.existsSync(logDir)) {
      return;
    }

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const files = await readdir(logDir);

    // 오늘 파일 제외, .log 파일만 (이미 압축된 .gz 제외)
    const uncompressedLogs = files.filter(file => {
      return file.endsWith('.log') && !file.includes(today);
    });

    for (const file of uncompressedLogs) {
      const inputPath = path.join(logDir, file);
      const outputPath = path.join(logDir, `${file}.gz`);

      // 이미 압축 파일이 존재하면 스킵
      if (fs.existsSync(outputPath)) {
        continue;
      }

      try {
        const input = fs.createReadStream(inputPath);
        const output = fs.createWriteStream(outputPath);
        const gzip = zlib.createGzip();

        await pipelineAsync(input, gzip, output);

        // 압축 성공 후 원본 삭제
        await unlink(inputPath);
        logger.info(`로그 파일 압축 완료: ${file} → ${file}.gz`);
      } catch (err) {
        logger.error(`로그 파일 압축 실패: ${file}`, err);
      }
    }
  } catch (error) {
    logger.error('오래된 로그 압축 중 오류:', error);
  }
}

// 로그 폴더 용량 체크 및 정리 (100MB 제한)
async function cleanupLogFiles() {
  try {
    // logs 디렉토리가 없으면 생성
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
      return;
    }

    const MAX_SIZE = 100 * 1024 * 1024; // 100MB
    const files = await readdir(logDir);

    // 파일 정보 수집 (크기, 수정 시간)
    const fileStats = await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(logDir, file);
        const stats = await stat(filePath);
        return {
          name: file,
          path: filePath,
          size: stats.size,
          mtime: stats.mtime,
          isToday: file.includes(new Date().toISOString().split('T')[0])
        };
      })
    );

    // 전체 용량 계산
    const totalSize = fileStats.reduce((sum, file) => sum + file.size, 0);

    if (totalSize > MAX_SIZE) {
      logger.info(`로그 폴더 용량 ${(totalSize / 1024 / 1024).toFixed(2)}MB 초과, 정리 시작`);

      // 오래된 파일부터 정렬 (오늘 파일 제외)
      const oldFiles = fileStats
        .filter(file => !file.isToday)
        .sort((a, b) => a.mtime - b.mtime);

      let currentSize = totalSize;
      for (const file of oldFiles) {
        if (currentSize <= MAX_SIZE) break;

        await unlink(file.path);
        currentSize -= file.size;
        logger.info(`오래된 로그 파일 삭제: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
      }

      logger.info(`로그 폴더 정리 완료, 현재 용량: ${(currentSize / 1024 / 1024).toFixed(2)}MB`);
    }
  } catch (error) {
    logger.error('로그 파일 정리 중 오류:', error);
  }
}

// 매일 자정에 로그 정리 (24시간마다)
setInterval(cleanupLogFiles, 24 * 60 * 60 * 1000);

// 서버 시작 시 한 번 실행
compressOldLogs();  // 압축되지 않은 오래된 로그 압축
cleanupLogFiles();  // 용량 체크 및 정리

export default logger;