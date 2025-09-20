import mongoose from 'mongoose';
import { connectDB } from '../src/lib/server/db.js';
import User from '../src/lib/server/models/User.js';
import Revenue from '../src/lib/server/models/Revenue.js';
import PaymentSchedule from '../src/lib/server/models/PaymentSchedule.js';
import WeeklyPayment from '../src/lib/server/models/WeeklyPayment.js';

async function checkPayments() {
	try {
		await connectDB();
		console.log('MongoDB 연결 성공\n');

		// 1. Revenue 데이터 확인
		console.log('=== Revenue 데이터 ===');
		const revenues = await Revenue.find({});
		console.log(`총 ${revenues.length}개의 Revenue 데이터`);
		revenues.forEach(rev => {
			console.log(`- ${rev.year}년 ${rev.month}월: ${rev.totalAmount?.toLocaleString()}원`);
			console.log(`  newMembers: ${rev.newMembers}`);
			console.log(`  gradeDistribution:`, rev.gradeDistribution ? '있음' : '없음');
		});

		// 2. PaymentSchedule 데이터 확인
		console.log('\n=== PaymentSchedule 데이터 ===');
		const schedules = await PaymentSchedule.find({});
		console.log(`총 ${schedules.length}개의 스케줄`);

		// 2025년 10월 1주차 데이터 확인
		const oct1Week = await PaymentSchedule.find({
			paymentYear: 2025,
			paymentMonth: 10,
			paymentWeek: 1
		}).populate('revenueId');

		console.log(`\n2025년 10월 1주차 스케줄: ${oct1Week.length}개`);
		oct1Week.forEach(schedule => {
			console.log(`- ${schedule.revenueYear}년 ${schedule.revenueMonth}월 매출의 ${schedule.installmentNumber}회차`);
			console.log(`  분할금액: ${schedule.installmentAmount?.toLocaleString()}원`);
			console.log(`  Revenue 연결: ${schedule.revenueId ? '있음' : '없음'}`);
			if (schedule.revenueId) {
				console.log(`  Revenue gradeDistribution: ${schedule.revenueId.gradeDistribution ? '있음' : '없음'}`);
			}
		});

		// 3. getWeeklyInstallments 테스트
		console.log('\n=== getWeeklyInstallments 테스트 ===');
		const testInstallments = await PaymentSchedule.getWeeklyInstallments(2025, 10, 1);
		console.log(`getWeeklyInstallments(2025, 10, 1) 결과: ${testInstallments.length}개`);

		if (testInstallments.length > 0) {
			console.log('첫 번째 installment:');
			const first = testInstallments[0];
			console.log(`  revenueId: ${first.revenueId}`);
			console.log(`  populated: ${first.populated('revenueId')}`);
			if (first.revenueId) {
				console.log(`  revenue year: ${first.revenueId.year}`);
				console.log(`  revenue month: ${first.revenueId.month}`);
				console.log(`  gradeDistribution: ${first.revenueId.gradeDistribution}`);
			}
		}

		// 4. User 데이터 확인
		console.log('\n=== User 데이터 ===');
		const users = await User.find({});
		console.log(`총 ${users.length}명의 사용자`);
		const gradeCounts = {};
		users.forEach(user => {
			gradeCounts[user.grade] = (gradeCounts[user.grade] || 0) + 1;
		});
		console.log('등급별 분포:');
		Object.entries(gradeCounts).forEach(([grade, count]) => {
			console.log(`  ${grade}: ${count}명`);
		});

		// 5. WeeklyPayment 데이터 확인
		console.log('\n=== WeeklyPayment 데이터 ===');
		const weeklyPayments = await WeeklyPayment.find({});
		console.log(`총 ${weeklyPayments.length}개의 주간 지급 데이터`);

		// 2025년 10월 1주차 데이터 확인
		const oct1Payment = await WeeklyPayment.findOne({
			year: 2025,
			month: 10,
			week: 1
		});

		if (oct1Payment) {
			console.log(`\n2025년 10월 1주차 지급 데이터:`);
			console.log(`  지급 대상자: ${oct1Payment.payments?.length || 0}명`);
			console.log(`  총 지급액: ${oct1Payment.totalPayment?.toLocaleString()}원`);
			console.log(`  상태: ${oct1Payment.status}`);
		} else {
			console.log(`\n2025년 10월 1주차 지급 데이터: 없음`);
		}

	} catch (error) {
		console.error('오류 발생:', error);
	} finally {
		await mongoose.disconnect();
		console.log('\nMongoDB 연결 종료');
	}
}

checkPayments();