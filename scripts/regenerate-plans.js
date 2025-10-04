import { connectDB } from '../apps/web/src/lib/server/db.js';
import { calculateMonthlyRevenue, generatePaymentPlans } from '../apps/web/src/lib/server/services/revenueCalculation.js';

async function regeneratePlans() {
  try {
    await connectDB();

    // 기존 매출 데이터를 사용하여 재계산
    const revenueData = await calculateMonthlyRevenue(2025, 7, true); // skipExistingCheck = true

    console.log('매출 데이터:');
    console.log('  총매출:', revenueData.totalRevenue.toLocaleString());
    console.log('  F1 지급액:', revenueData.gradePayments.F1.toLocaleString());
    console.log('  F2 지급액:', revenueData.gradePayments.F2.toLocaleString());

    console.log('\n지급 계획 생성 중...');
    await generatePaymentPlans(revenueData);
    console.log('완료!');

    process.exit(0);
  } catch (error) {
    console.error('오류:', error);
    process.exit(1);
  }
}

regeneratePlans();