import mongoose from 'mongoose';
import User from '../src/lib/server/models/User.js';
import Revenue from '../src/lib/server/models/Revenue.js';
import PaymentSchedule from '../src/lib/server/models/PaymentSchedule.js';
import { WeeklyPayment } from '../src/lib/server/models/Payment.js';

// MongoDB 연결
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/nanumpay';

async function connectDB() {
	try {
		await mongoose.connect(MONGODB_URI);
		console.log('MongoDB 연결 성공');
	} catch (error) {
		console.error('MongoDB 연결 실패:', error);
		process.exit(1);
	}
}

async function checkPaymentData() {
	console.log('=== 결제 데이터 검증 시작 ===\n');

	// 1. 사용자 데이터 확인
	console.log('1. 사용자 데이터 확인');
	const userCount = await User.countDocuments();
	console.log(`전체 사용자 수: ${userCount}`);

	if (userCount > 0) {
		const usersByGrade = await User.aggregate([
			{ $group: { _id: '$grade', count: { $sum: 1 } } },
			{ $sort: { _id: 1 } }
		]);
		console.log('등급별 사용자 분포:');
		usersByGrade.forEach(item => {
			console.log(`  ${item._id}: ${item.count}명`);
		});
	}
	console.log('');

	// 2. Revenue 데이터 확인
	console.log('2. Revenue 데이터 확인');
	const revenueCount = await Revenue.countDocuments();
	console.log(`Revenue 데이터 수: ${revenueCount}`);

	if (revenueCount > 0) {
		const revenues = await Revenue.find().sort({ year: 1, month: 1 }).limit(5);
		console.log('최근 Revenue 데이터:');
		revenues.forEach(rev => {
			console.log(`  ${rev.year}년 ${rev.month}월 - 총액: ${rev.totalAmount.toLocaleString()}원, 신규회원: ${rev.newMembers}명`);
		});
	}
	console.log('');

	// 3. PaymentSchedule 데이터 확인
	console.log('3. PaymentSchedule 데이터 확인');
	const scheduleCount = await PaymentSchedule.countDocuments();
	console.log(`PaymentSchedule 데이터 수: ${scheduleCount}`);

	if (scheduleCount > 0) {
		const schedules = await PaymentSchedule.find()
			.populate('revenueId')
			.sort({ paymentYear: 1, paymentMonth: 1, paymentWeek: 1, installmentNumber: 1 })
			.limit(10);

		console.log('최근 PaymentSchedule 데이터:');
		schedules.forEach(schedule => {
			console.log(`  ${schedule.revenueYear}년 ${schedule.revenueMonth}월 매출 - ${schedule.installmentNumber}회차`);
			console.log(`    지급예정: ${schedule.paymentYear}년 ${schedule.paymentMonth}월 ${schedule.paymentWeek}주차`);
			console.log(`    금액: ${schedule.installmentAmount.toLocaleString()}원, 상태: ${schedule.status}`);
			console.log(`    Revenue ID: ${schedule.revenueId ? schedule.revenueId._id : 'null'}`);
		});
	}
	console.log('');

	// 4. WeeklyPayment 데이터 확인
	console.log('4. WeeklyPayment 데이터 확인');
	const weeklyPaymentCount = await WeeklyPayment.countDocuments();
	console.log(`WeeklyPayment 데이터 수: ${weeklyPaymentCount}`);

	if (weeklyPaymentCount > 0) {
		const weeklyPayments = await WeeklyPayment.find()
			.sort({ year: 1, month: 1, week: 1 })
			.limit(5);

		console.log('최근 WeeklyPayment 데이터:');
		weeklyPayments.forEach(payment => {
			console.log(`  ${payment.year}년 ${payment.month}월 ${payment.week}주차`);
			console.log(`    총 지급액: ${payment.totalPayment?.toLocaleString() || 0}원`);
			console.log(`    총 세금: ${payment.totalTax?.toLocaleString() || 0}원`);
			console.log(`    실지급액: ${payment.totalNet?.toLocaleString() || 0}원`);
			console.log(`    대상자 수: ${payment.payments?.length || 0}명`);
			console.log(`    상태: ${payment.status}`);
		});
	}
	console.log('');

	// 5. 특정 주차의 스케줄 데이터 테스트
	console.log('5. 특정 주차 스케줄 테스트 (2024년 9월 1주차)');
	try {
		const testInstallments = await PaymentSchedule.getWeeklyInstallments(2024, 9, 1);
		console.log(`2024년 9월 1주차 분할금 개수: ${testInstallments.length}`);

		if (testInstallments.length > 0) {
			console.log('상세 내역:');
			testInstallments.forEach(installment => {
				console.log(`  매출: ${installment.revenueYear}년 ${installment.revenueMonth}월 - ${installment.installmentNumber}회차`);
				console.log(`  금액: ${installment.installmentAmount.toLocaleString()}원`);
				console.log(`  Revenue 데이터: ${installment.revenueId ? '있음' : '없음'}`);
				if (installment.revenueId) {
					console.log(`    총 매출: ${installment.revenueId.totalAmount?.toLocaleString() || 0}원`);
					console.log(`    등급별 분포: ${Object.keys(installment.revenueId.gradeDistribution || {}).length}개 등급`);
				}
			});
		}
	} catch (error) {
		console.error('특정 주차 스케줄 조회 오류:', error.message);
	}
	console.log('');

	console.log('=== 결제 데이터 검증 완료 ===');
}

async function main() {
	await connectDB();
	await checkPaymentData();
	await mongoose.disconnect();
	console.log('MongoDB 연결 종료');
}

main().catch(console.error);