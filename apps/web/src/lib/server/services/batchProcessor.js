import { processUserRegistration } from './registrationService.js';
import { excelLogger as logger } from '../logger.js';

/**
 * 용역자 등록 시 자동 처리 시스템 v5.0
 * - registrationService로 위임
 */
export class BatchProcessor {
  constructor() {
    this.processingQueue = [];
    this.isProcessing = false;
  }

  /**
   * 신규 용역자 등록 시 자동 처리 (v5.0)
   * registrationService.processUserRegistration으로 위임
   */
  async processNewUsers(userIds, options = {}) {
    const startTime = Date.now();
    logger.info(`=== 용역자 등록 자동 처리 시작 (v5.0) ===`, {
      userCount: userIds.length,
      timestamp: new Date().toISOString()
    });

    try {
      // v5.0 registrationService 사용
      const result = await processUserRegistration(userIds);

      const processingTime = Date.now() - startTime;
      logger.info(`=== 자동 처리 완료 (${processingTime}ms) ===`);

      return {
        success: true,
        processingTime,
        results: result
      };
    } catch (error) {
      logger.error('자동 처리 실패:', error);
      throw error;
    }
  }
}

// 싱글톤 인스턴스
export const batchProcessor = new BatchProcessor();
