/**
 * 개발 로거 유틸리티
 *
 * 환경변수로 로그 레벨 제어:
 * - NODE_ENV=production: 로그 출력 안 함
 * - DEV_LOG=false: 로그 출력 안 함
 * - DEV_LOG=true 또는 미설정: 로그 출력
 */

const isDevelopment = process.env.NODE_ENV !== 'production';
const devLogEnabled = process.env.DEV_LOG !== 'false';
const shouldLog = isDevelopment && devLogEnabled;

/**
 * 개발 로그 출력 (production에서는 무시)
 */
export const devLog = {
  /**
   * 일반 로그
   */
  log: (...args) => {
    if (shouldLog) {
      console.log(...args);
    }
  },

  /**
   * 정보 로그 (파란색)
   */
  info: (...args) => {
    if (shouldLog) {
      console.log('\x1b[36m%s\x1b[0m', ...args);  // cyan
    }
  },

  /**
   * 경고 로그 (노란색)
   */
  warn: (...args) => {
    if (shouldLog) {
      console.warn('\x1b[33m%s\x1b[0m', ...args);  // yellow
    }
  },

  /**
   * 에러 로그 (빨간색) - production에서도 출력
   */
  error: (...args) => {
    console.error('\x1b[31m%s\x1b[0m', ...args);  // red (항상 출력)
  },

  /**
   * 구분선 출력
   */
  separator: (char = '=', length = 80) => {
    if (shouldLog) {
      console.log(char.repeat(length));
    }
  },

  /**
   * 섹션 헤더 출력
   */
  section: (title) => {
    if (shouldLog) {
      console.log('\n' + '='.repeat(80));
      console.log(title);
      console.log('='.repeat(80));
    }
  },

  /**
   * 디버그 로그 (회색) - 더 상세한 로그
   */
  debug: (...args) => {
    if (shouldLog && process.env.DEV_LOG_LEVEL === 'debug') {
      console.log('\x1b[90m[DEBUG]\x1b[0m', ...args);  // gray
    }
  },

  /**
   * 성공 로그 (초록색)
   */
  success: (...args) => {
    if (shouldLog) {
      console.log('\x1b[32m✓\x1b[0m', ...args);  // green
    }
  }
};

/**
 * 조건부 로그 실행
 * @param {Function} fn - 로그 출력 함수
 */
export const withDevLog = (fn) => {
  if (shouldLog) {
    fn();
  }
};
