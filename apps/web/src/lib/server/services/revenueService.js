import User from '../models/User.js';
import MonthlyRevenue from '../models/MonthlyRevenue.js';
import UserPaymentPlan from '../models/UserPaymentPlan.js';
import WeeklyPayment from '../models/WeeklyPayment.js';
import { excelLogger as logger } from '../logger.js';
import { calculatePaymentWeek } from '../../utils/fridayWeekCalculator.js';

/**
 * 특정 월의 매출 계산
 * @param {number} year - 연도
 * @param {number} month - 월
 */
export async function calculateMonthlyRevenueForMonth(year, month) {
  try {
    logger.info(`${year}년 ${month}월 매출 계산 시작`);

    // 해당 월의 신규 가입자 수 조회
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0, 23, 59, 59);

    const newUsers = await User.find({
      type: 'user', // 용역자만 대상
      createdAt: { $gte: firstDay, $lte: lastDay }
    });

    const newUsersCount = newUsers.length;

    // 총매출 계산 (1인당 100만원)
    const totalRevenue = newUsersCount * 1000000;
    const revenuePerInstallment = totalRevenue / 10;

    // 등급별 인원 분포 (해당 월 기준, 용역자만)
    const gradeDistribution = await User.aggregate([
      { $match: {
        type: 'user', // 용역자만 대상
        status: 'active',
        createdAt: { $lte: lastDay } // 해당 월까지의 모든 활성 사용자
      }},
      { $group: { _id: '$grade', count: { $sum: 1 } } }
    ]);

    const gradeCount = {
      F1: 0, F2: 0, F3: 0, F4: 0, F5: 0, F6: 0, F7: 0, F8: 0
    };

    gradeDistribution.forEach(item => {
      if (item._id) gradeCount[item._id] = item.count;
    });

    // 등급별 지급액 계산
    const gradePayments = calculateGradePayments(totalRevenue, gradeCount);

    // 사용자별 매출 정보 생성
    const userRevenues = [];
    for (const user of newUsers) {
      const commission = gradePayments[user.grade] || 0;
      userRevenues.push({
        userId: user._id,
        userName: user.name,
        loginId: user.loginId,
        grade: user.grade,
        baseAmount: 1000000,
        commission: commission,
        totalAmount: commission,
        createdAt: user.createdAt
      });
    }

    // MonthlyRevenue 저장 또는 업데이트
    const monthlyRevenue = await MonthlyRevenue.findOneAndUpdate(
      { year, month },
      {
        year,
        month,
        newUsersCount,
        totalRevenue,
        revenuePerInstallment,
        gradeDistribution: gradeCount,
        gradePayments,
        isCalculated: true,
        calculatedAt: new Date(),
        createdAt: new Date()
      },
      { upsert: true, new: true }
    );

    // 개인별 지급 계획 생성
    await createUserPaymentPlans(year, month, userRevenues);

    // NOTE: WeeklyPayment는 실제 금요일 지급 스케줄러에서 생성됨
    // createWeeklyPaymentSchedules는 더 이상 사용하지 않음

    logger.info(`${year}년 ${month}월 매출 계산 완료:`, {
      newUsers: newUsersCount,
      totalRevenue: totalRevenue.toLocaleString(),
      installment: revenuePerInstallment.toLocaleString()
    });

    return monthlyRevenue;
  } catch (error) {
    logger.error(`${year}년 ${month}월 매출 계산 실패:`, error);
    throw error;
  }
}

/**
 * 등급별 지급액 계산
 */
function calculateGradePayments(totalRevenue, gradeCount) {
  const gradeRatios = {
    F1: 0.24, F2: 0.19, F3: 0.14, F4: 0.09,
    F5: 0.05, F6: 0.03, F7: 0.02, F8: 0.01
  };

  const payments = {};
  let previousPayment = 0;

  // F1 계산
  if (gradeCount.F1 > 0) {
    const totalF1andF2 = gradeCount.F1 + gradeCount.F2;
    if (totalF1andF2 > 0) {
      const f1Base = (totalRevenue * gradeRatios.F1) / totalF1andF2;
      payments.F1 = f1Base;
      previousPayment = f1Base;
    }
  }

  // F2 계산 (F1 + 추가분)
  if (gradeCount.F2 > 0) {
    const totalF2toF8 = gradeCount.F2 + gradeCount.F3 + gradeCount.F4 + gradeCount.F5 + gradeCount.F6 + gradeCount.F7 + gradeCount.F8;
    if (totalF2toF8 > 0) {
      const f2Additional = (totalRevenue * gradeRatios.F2) / totalF2toF8;
      payments.F2 = previousPayment + f2Additional;
      previousPayment = payments.F2;
    }
  }

  // F3~F8 계산 (누적)
  const grades = ['F3', 'F4', 'F5', 'F6', 'F7', 'F8'];
  for (const grade of grades) {
    if (gradeCount[grade] > 0) {
      const higherGrades = grades.slice(grades.indexOf(grade));
      const totalHigherGrades = higherGrades.reduce((sum, g) => sum + gradeCount[g], 0);

      if (totalHigherGrades > 0) {
        const additional = (totalRevenue * gradeRatios[grade]) / totalHigherGrades;
        payments[grade] = previousPayment + additional;
        previousPayment = payments[grade];
      }
    }
  }

  return payments;
}

/**
 * 개인별 지급 계획 생성
 */
async function createUserPaymentPlans(year, month, userRevenues) {
  logger.info(`createUserPaymentPlans 시작: ${year}년 ${month}월, 대상 사용자 ${userRevenues.length}명`);
  
  const totalRevenue = userRevenues.reduce((sum, ur) => sum + 1000000, 0); // 1인당 100만원
  const revenuePerInstallment = totalRevenue / 10;

  for (const userRevenue of userRevenues) {
    logger.info(`UserPaymentPlan 생성: ${userRevenue.userName} (${userRevenue.grade}), 총액: ${userRevenue.totalAmount}`);
    
    const installments = [];
    const amountPerInstallment = userRevenue.totalAmount / 10;

    for (let installmentNumber = 1; installmentNumber <= 10; installmentNumber++) {
      // 정확한 주차 계산 (월별 실제 주차 수 고려)
      const paymentSchedule = calculatePaymentWeek(year, month, installmentNumber);
      const scheduleYear = paymentSchedule.year;
      const scheduleMonth = paymentSchedule.month;
      const scheduleWeek = paymentSchedule.week;

      installments.push({
        installmentNumber,
        scheduledDate: {
          year: scheduleYear,
          month: scheduleMonth,
          week: scheduleWeek
        },
        amount: amountPerInstallment,
        status: 'pending'
      });
    }

    const plan = await UserPaymentPlan.findOneAndUpdate(
      {
        userId: userRevenue.userId,
        'revenueMonth.year': year,
        'revenueMonth.month': month
      },
      {
        revenueMonth: { year, month },
        totalRevenue,
        revenuePerInstallment,
        userId: userRevenue.userId,
        userName: userRevenue.userName,
        grade: userRevenue.grade,
        amountPerInstallment,
        totalAmount: userRevenue.totalAmount,
        installments,
        createdAt: new Date()
      },
      { upsert: true, new: true }
    );
    
    logger.info(`UserPaymentPlan 생성 완료: ${userRevenue.userName}, ID: ${plan._id}`);
  }
  
  logger.info(`createUserPaymentPlans 완료: ${year}년 ${month}월, 총 ${userRevenues.length}개 생성`);
}

/**
 * 주간 지급 스케줄 생성
 * N월 매출 -> N+1월부터 10주간 지급
 */
async function createWeeklyPaymentSchedules(year, month, monthlyRevenue) {
  const WeeklyPayment = (await import('../models/WeeklyPayment.js')).default;
  const User = (await import('../models/User.js')).default;

  // N+1월부터 시작
  let paymentYear = year;
  let paymentMonth = month + 1;
  if (paymentMonth > 12) {
    paymentYear++;
    paymentMonth = 1;
  }

  logger.info(`${year}년 ${month}월 매출 -> ${paymentYear}년 ${paymentMonth}월부터 지급 시작`);

  // 사용자 목록 가져오기 (관리자 제외, 해당 월에 존재했던 사용자)
  const users = await User.find({
    type: { $ne: 'admin' },
    createdAt: { $lte: new Date(year, month, 0) } // 해당 월 마지막 날까지 가입한 사용자
  });

  // 10회차 지급 생성
  for (let installment = 1; installment <= 10; installment++) {
    // 정확한 주차 계산 (월별 실제 주차 수 고려)
    const paymentSchedule = calculatePaymentWeek(year, month, installment);
    const scheduleYear = paymentSchedule.year;
    const scheduleMonth = paymentSchedule.month;
    const weekNum = paymentSchedule.week;

    logger.info(`${installment}회차: ${scheduleYear}년 ${scheduleMonth}월 ${weekNum}주차`);

    // 각 사용자별 지급 데이터 생성
    for (const user of users) {
      const paymentAmount = monthlyRevenue.gradePayments[user.grade] || 0;

      if (paymentAmount > 0) {
        const taxAmount = Math.floor((paymentAmount * 0.033) / 100) * 100; // 100원 단위 절삭
        const netAmount = paymentAmount - taxAmount;

        await WeeklyPayment.findOneAndUpdate(
          {
            userId: user._id,
            year: scheduleYear,
            month: scheduleMonth,
            week: weekNum
          },
          {
            userId: user._id,
            year: scheduleYear,
            month: scheduleMonth,
            week: weekNum,
            totalAmount: paymentAmount,
            taxAmount: taxAmount,
            netAmount: netAmount,
            installments: [{
              revenueYear: year,
              revenueMonth: month,
              installmentNumber: installment,
              amount: paymentAmount
            }],
            paymentStatus: 'pending',
            createdAt: new Date(),
            updatedAt: new Date()
          },
          { upsert: true, new: true }
        );
      }
    }
  }

  const totalPayments = await WeeklyPayment.countDocuments({
    'installments.revenueYear': year,
    'installments.revenueMonth': month
  });

  logger.info(`${year}년 ${month}월 매출에 대한 WeeklyPayment ${totalPayments}건 생성 완료`);
}

export default {
  calculateMonthlyRevenueForMonth
};