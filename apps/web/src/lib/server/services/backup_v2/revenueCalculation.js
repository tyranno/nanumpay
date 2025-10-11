import User from '../models/User.js';
import UserPaymentPlan from '../models/UserPaymentPlan.js';
import MonthlyRevenue from '../models/MonthlyRevenue.js';
import { db } from '../db.js';
import { calculatePaymentWeek } from '../../utils/fridayWeekCalculator.js';

/**
 * 월말 매출 계산 및 지급 스케줄 생성
 * @param {number} year - 매출 발생 년도
 * @param {number} month - 매출 발생 월 (1-12)
 */
export async function calculateMonthlyRevenue(year, month, skipExistingCheck = false) {
  await db();

  // 이미 계산된 매출이 있는지 확인
  if (!skipExistingCheck) {
    const existing = await MonthlyRevenue.findOne({ year, month, isCalculated: true });
    if (existing) {
      throw new Error(`${year}년 ${month}월 매출은 이미 계산되었습니다.`);
    }
  }

  // 1. 해당 월에 등록된 사용자 수 계산
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);
  
  const newUsersCount = await User.countDocuments({
    createdAt: { $gte: startDate, $lte: endDate }
  });
  
  // 2. 총매출 계산 (신규 가입자 x 100만원)
  const totalRevenue = newUsersCount * 1000000;
  const revenuePerInstallment = totalRevenue / 10;
  
  // 3. 현재 활성 사용자의 등급별 분포
  const gradeDistribution = await User.aggregate([
    { $match: { status: 'active' } },
    { $group: { _id: '$grade', count: { $sum: 1 } } }
  ]);
  
  const gradeCount = {
    F1: 0, F2: 0, F3: 0, F4: 0, F5: 0, F6: 0, F7: 0, F8: 0
  };
  
  gradeDistribution.forEach(item => {
    if (item._id) gradeCount[item._id] = item.count;
  });
  
  // 4. 등급별 비율
  const gradeRatios = {
    F1: 0.24, F2: 0.19, F3: 0.14, F4: 0.09,
    F5: 0.05, F6: 0.03, F7: 0.02, F8: 0.01
  };
  
  // 5. 등급별 지급액 계산 (MLM 누적 방식)
  // 비즈니스 로직: 상위 등급은 하위 등급 지급액 + 추가 배분
  const gradePayments = {};

  // F1 지급액 = (총매출 × 24%) ÷ (F1 인원 + F2 인원)
  const f1Pool = revenuePerInstallment * gradeRatios.F1;
  const f1Divisor = gradeCount.F1 + gradeCount.F2;
  gradePayments.F1 = f1Divisor > 0 ? Math.floor(f1Pool / f1Divisor) : 0;

  // F2 지급액 = F1 지급액 + (총매출 × 19%) ÷ (F2 인원 + F3 인원)
  const f2Pool = revenuePerInstallment * gradeRatios.F2;
  const f2Divisor = gradeCount.F2 + gradeCount.F3;
  gradePayments.F2 = f2Divisor > 0 ? gradePayments.F1 + Math.floor(f2Pool / f2Divisor) : gradePayments.F1;

  // F3 지급액 = F2 지급액 + (총매출 × 14%) ÷ (F3 인원 + F4 인원)
  const f3Pool = revenuePerInstallment * gradeRatios.F3;
  const f3Divisor = gradeCount.F3 + gradeCount.F4;
  gradePayments.F3 = f3Divisor > 0 ? gradePayments.F2 + Math.floor(f3Pool / f3Divisor) : gradePayments.F2;

  // F4 지급액 = F3 지급액 + (총매출 × 9%) ÷ (F4 인원 + F5 인원)
  const f4Pool = revenuePerInstallment * gradeRatios.F4;
  const f4Divisor = gradeCount.F4 + gradeCount.F5;
  gradePayments.F4 = f4Divisor > 0 ? gradePayments.F3 + Math.floor(f4Pool / f4Divisor) : gradePayments.F3;

  // F5 지급액 = F4 지급액 + (총매출 × 5%) ÷ (F5 인원 + F6 인원)
  const f5Pool = revenuePerInstallment * gradeRatios.F5;
  const f5Divisor = gradeCount.F5 + gradeCount.F6;
  gradePayments.F5 = f5Divisor > 0 ? gradePayments.F4 + Math.floor(f5Pool / f5Divisor) : gradePayments.F4;

  // F6 지급액 = F5 지급액 + (총매출 × 3%) ÷ (F6 인원 + F7 인원)
  const f6Pool = revenuePerInstallment * gradeRatios.F6;
  const f6Divisor = gradeCount.F6 + gradeCount.F7;
  gradePayments.F6 = f6Divisor > 0 ? gradePayments.F5 + Math.floor(f6Pool / f6Divisor) : gradePayments.F5;

  // F7 지급액 = F6 지급액 + (총매출 × 2%) ÷ (F7 인원 + F8 인원)
  const f7Pool = revenuePerInstallment * gradeRatios.F7;
  const f7Divisor = gradeCount.F7 + gradeCount.F8;
  gradePayments.F7 = f7Divisor > 0 ? gradePayments.F6 + Math.floor(f7Pool / f7Divisor) : gradePayments.F6;

  // F8 지급액 = F7 지급액 + (총매출 × 1%) ÷ F8 인원
  const f8Pool = revenuePerInstallment * gradeRatios.F8;
  const f8Divisor = gradeCount.F8;
  gradePayments.F8 = f8Divisor > 0 ? gradePayments.F7 + Math.floor(f8Pool / f8Divisor) : gradePayments.F7;
  
  return {
    year,
    month,
    newUsersCount,
    totalRevenue,
    revenuePerInstallment,
    gradeCount,
    gradePayments
  };
}

/**
 * 사용자별 지급 계획 생성
 * @param {Object} revenueData - 매출 계산 데이터
 * @param {String} adminId - 관리자 ID
 */
export async function generatePaymentPlans(revenueData, adminId = null) {
  const { year, month, totalRevenue, revenuePerInstallment, gradePayments, gradeCount } = revenueData;
  
  // 현재 활성 사용자 목록 (매출 발생 시점의 사용자만 지급 대상)
  const activeUsers = await User.find({ status: 'active' });
  
  const paymentPlans = [];
  
  for (const user of activeUsers) {
    const amountPerInstallment = gradePayments[user.grade] || 0;
    const totalAmount = amountPerInstallment * 10;
    
    // 10회 분할 지급 스케줄 생성
    const installments = [];
    for (let i = 1; i <= 10; i++) {
      const scheduledDate = calculateInstallmentDate(year, month, i);
      installments.push({
        installmentNumber: i,
        scheduledDate,
        amount: amountPerInstallment,
        status: 'pending'
      });
    }
    
    const paymentPlan = new UserPaymentPlan({
      revenueMonth: { year, month },
      totalRevenue,
      revenuePerInstallment,
      userId: user._id.toString(),  // ObjectId 문자열로 저장
      userName: user.name,
      grade: user.grade,
      amountPerInstallment,
      totalAmount,
      installments
    });
    
    paymentPlans.push(paymentPlan);
  }
  
  // 데이터베이스에 저장
  await UserPaymentPlan.insertMany(paymentPlans);

  // MonthlyRevenue 저장
  await MonthlyRevenue.findOneAndUpdate(
    { year, month },
    {
      year,
      month,
      newUsersCount: activeUsers.length,
      totalRevenue,
      revenuePerInstallment,
      gradeDistribution: gradeCount,
      gradePayments,
      isCalculated: true,
      calculatedAt: new Date(),
      calculatedBy: adminId
    },
    { upsert: true }
  );

  return paymentPlans;
}

/**
 * 분할 회차별 지급 예정일 계산
 * @param {number} revenueYear - 매출 발생 년도
 * @param {number} revenueMonth - 매출 발생 월 (1-12)
 * @param {number} installmentNumber - 회차 (1-10)
 */
function calculateInstallmentDate(revenueYear, revenueMonth, installmentNumber) {
  // 철 회차는 매출 발생 다음 달부터 시작
  let year = revenueYear;
  let month = revenueMonth + 1;
  
  // 월이 12를 초과하면 다음 해로
  if (month > 12) {
    month = 1;
    year++;
  }
  
  // 정확한 주차 계산 (월별 실제 주차 수 고려)
  return calculatePaymentWeek(revenueYear, revenueMonth, installmentNumber);
}

/**
 * 특정 주차의 지급액 계산
 * @param {number} year - 지급 년도
 * @param {number} month - 지급 월 (1-12)
 * @param {number} week - 지급 주차 (1-5)
 */
export async function calculateWeeklyPayment(year, month, week) {
  await db();
  
  // 해당 주차에 지급 예정인 분할금 조회
  const scheduledPayments = await UserPaymentPlan.aggregate([
    {
      $unwind: '$installments'
    },
    {
      $match: {
        'installments.scheduledDate.year': year,
        'installments.scheduledDate.month': month,
        'installments.scheduledDate.week': week,
        'installments.status': 'pending'
      }
    },
    {
      $group: {
        _id: {
          revenueYear: '$revenueMonth.year',
          revenueMonth: '$revenueMonth.month',
          installmentNumber: '$installments.installmentNumber'
        },
        totalAmount: { $sum: '$installments.amount' },
        userCount: { $sum: 1 },
        users: { 
          $push: {
            userId: '$userId',
            userName: '$userName',
            grade: '$grade',
            amount: '$installments.amount'
          }
        }
      }
    },
    {
      $sort: { '_id.revenueYear': 1, '_id.revenueMonth': 1 }
    }
  ]);
  
  return {
    year,
    month,
    week,
    payments: scheduledPayments,
    totalAmount: scheduledPayments.reduce((sum, p) => sum + p.totalAmount, 0),
    totalUsers: scheduledPayments.reduce((sum, p) => sum + p.userCount, 0)
  };
}