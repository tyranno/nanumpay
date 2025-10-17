/**
 * 등급 재계산 모듈 v7.0
 *
 * 역할: 등급 재계산을 담당하는 모듈
 *
 * 기존 gradeCalculation.js 서비스를 래핑하여
 * processUserRegistration에서 사용하기 쉽게 구성
 */

import { recalculateAllGrades } from '../gradeCalculation.js';
import { excelLogger as logger } from '../../logger.js';

/**
 * 등급 재계산 실행
 *
 * @returns {Object} { changedUsers: Array, ... }
 */
export async function recalculateGrades() {


  const gradeChangeResult = await recalculateAllGrades();
  const changedUsers = gradeChangeResult.changedUsers || [];



  if (changedUsers.length > 0) {
    changedUsers.forEach(u => {
      if (u.changeType === 'grade_change' && u.oldGrade && u.newGrade) {
      }
    });
  }


  return gradeChangeResult;
}
