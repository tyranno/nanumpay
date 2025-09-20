import { json } from '@sveltejs/kit';
import { calculateMonthlyRevenue, generatePaymentPlans } from '$lib/server/services/revenueCalculation.js';

/**
 * 월말 매출 계산 및 지급 스케줄 생성
 */
export async function POST({ locals, request }) {
  // 권한 검사
  if (!locals.user || locals.user.type !== 'admin') {
    return json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  try {
    const { year, month } = await request.json();
    
    // 유효성 검사
    if (!year || !month || month < 1 || month > 12) {
      return json({ 
        success: false, 
        message: '올바른 년도와 월을 입력해주세요.' 
      }, { status: 400 });
    }
    
    // 1. 매출 계산
    console.log(`[Revenue Calculation] ${year}년 ${month}월 매출 계산 시작`);
    const revenueData = await calculateMonthlyRevenue(year, month);
    
    // 2. 사용자별 지급 계획 생성
    console.log(`[Payment Plans] 사용자별 지급 계획 생성 시작`);
    const paymentPlans = await generatePaymentPlans(revenueData, locals.user.id);
    
    console.log(`[Complete] ${paymentPlans.length}명의 지급 계획 생성 완료`);
    
    return json({
      success: true,
      message: `${year}년 ${month}월 매출 계산 및 지급 계획 생성 완료`,
      data: {
        year,
        month,
        newUsersCount: revenueData.newUsersCount,
        totalRevenue: revenueData.totalRevenue,
        gradeCount: revenueData.gradeCount,
        gradePayments: revenueData.gradePayments,
        totalPlans: paymentPlans.length
      }
    });
    
  } catch (error) {
    console.error('[Revenue Calculation Error]', error);
    return json({ 
      success: false, 
      message: '매출 계산 중 오류가 발생했습니다.',
      error: error.message 
    }, { status: 500 });
  }
}

/**
 * 특정 월의 매출 및 지급 계획 조회
 */
export async function GET({ locals, url }) {
  // 권한 검사
  if (!locals.user || locals.user.type !== 'admin') {
    return json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  try {
    const year = parseInt(url.searchParams.get('year'));
    const month = parseInt(url.searchParams.get('month'));
    
    if (!year || !month) {
      return json({ 
        success: false, 
        message: '년도와 월을 지정해주세요.' 
      }, { status: 400 });
    }
    
    // 현재 월의 매출 데이터 계산 (저장하지 않고 조회만)
    const revenueData = await calculateMonthlyRevenue(year, month);
    
    return json({
      success: true,
      data: revenueData
    });
    
  } catch (error) {
    console.error('[Revenue Query Error]', error);
    return json({ 
      success: false, 
      message: '매출 조회 중 오류가 발생했습니다.',
      error: error.message 
    }, { status: 500 });
  }
}