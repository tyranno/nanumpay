import mongoose from 'mongoose';
import { connectDB } from '../src/lib/server/db.js';
import User from '../src/lib/server/models/User.js';
import Revenue from '../src/lib/server/models/Revenue.js';
import PaymentSchedule from '../src/lib/server/models/PaymentSchedule.js';
import WeeklyPayment from '../src/lib/server/models/WeeklyPayment.js';

// 등급별 수수료율
const GRADE_RATES = {
	'F1': 0.10, // 10%
	'F2': 0.12, // 12%
	'F3': 0.14, // 14%
	'F4': 0.16, // 16%
	'F5': 0.18, // 18%
	'F6': 0.20, // 20%
	'F7': 0.22, // 22%
	'F8': 0.25  // 25%
};

async function cleanDatabase() {
	console.log('기존 데이터 정리 중...');
	await Revenue.deleteMany({});
	await PaymentSchedule.deleteMany({});
	await WeeklyPayment.deleteMany({});
	console.log('기존 데이터 정리 완료');
}

async function createRevenues() {
	console.log('\n월별 매출 데이터 생성 중...');
	const revenues = [];

	// 2025년 6월부터 10월까지 매출 생성
	const revenueData = [
		{ year: 2025, month: 6, totalAmount: 50000000, newMembers: 5 }, // 5천만원
		{ year: 2025, month: 7, totalAmount: 60000000, newMembers: 6 }, // 6천만원
		{ year: 2025, month: 8, totalAmount: 75000000, newMembers: 7 }, // 7천5백만원
		{ year: 2025, month: 9, totalAmount: 80000000, newMembers: 8 }, // 8천만원
		{ year: 2025, month: 10, totalAmount: 90000000, newMembers: 9 } // 9천만원
	];

	for (const data of revenueData) {
		const revenue = await Revenue.create(data);
		revenues.push(revenue);
		console.log(`- ${data.year}년 ${data.month}월 매출: ${data.totalAmount.toLocaleString()}원 (분할금: ${revenue.installmentAmount.toLocaleString()}원 × 10회)`);
	}

	return revenues;
}

async function createPaymentSchedules(revenues) {
	console.log('\n지급 스케줄 생성 중...');
	const schedules = [];

	for (const revenue of revenues) {
		console.log(`\n${revenue.year}년 ${revenue.month}월 매출의 10회 분할 스케줄:`);

		for (let installmentNumber = 1; installmentNumber <= 10; installmentNumber++) {
			// 지급 주차 계산
			const { paymentYear, paymentMonth, paymentWeek } =
				PaymentSchedule.calculatePaymentWeek(revenue.year, revenue.month, installmentNumber);

			const schedule = await PaymentSchedule.create({
				revenueId: revenue._id,
				revenueYear: revenue.year,
				revenueMonth: revenue.month,
				installmentNumber,
				paymentYear,
				paymentMonth,
				paymentWeek,
				installmentAmount: revenue.installmentAmount,
				status: 'pending'
			});

			schedules.push(schedule);
			console.log(`  ${installmentNumber}회차 → ${paymentYear}년 ${paymentMonth}월 ${paymentWeek}주차 지급 예정`);
		}
	}

	return schedules;
}

async function createWeeklyPayments() {
	console.log('\n주차별 지급 데이터 생성 중...');

	// 모든 사용자 조회
	const users = await User.find({}).select('_id name grade bank accountNumber');
	console.log(`총 ${users.length}명의 사용자에 대한 지급 데이터 생성`);

	// 2025년 7월부터 12월까지 지급 데이터 생성
	for (let year = 2025; year <= 2025; year++) {
		for (let month = 7; month <= 12; month++) {
			console.log(`\n${year}년 ${month}월 지급 데이터 생성 중...`);

			// 각 월의 4주차까지만 생성 (5주차는 특별한 경우)
			for (let week = 1; week <= 4; week++) {
				// 해당 주차에 지급될 모든 분할금 조회
				const installments = await PaymentSchedule.getWeeklyInstallments(year, month, week);

				if (installments.length === 0) {
					console.log(`  ${week}주차: 지급 예정 없음`);
					continue;
				}

				// 해당 주차 총액
				const weekTotal = installments.reduce((sum, inst) => sum + inst.installmentAmount, 0);
				console.log(`  ${week}주차: 총 ${weekTotal.toLocaleString()}원 지급 예정`);

				// 분할금 정보
				installments.forEach(inst => {
					console.log(`    - ${inst.revenueYear}년 ${inst.revenueMonth}월 매출의 ${inst.installmentNumber}회차: ${inst.installmentAmount.toLocaleString()}원`);
				});

				// 각 사용자에 대한 지급 데이터 생성
				for (const user of users) {
					// 사용자 등급에 따른 수수료율
					const rate = GRADE_RATES[user.grade] || 0.10;

					// 사용자별 분할금 계산 (간단히 등급별 비율로 배분)
					const userInstallments = installments.map(inst => ({
						scheduleId: inst._id,
						revenueYear: inst.revenueYear,
						revenueMonth: inst.revenueMonth,
						installmentNumber: inst.installmentNumber,
						amount: Math.floor(inst.installmentAmount * rate / users.length) // 단순 균등 배분
					}));

					// 주차별 지급 데이터 생성
					await WeeklyPayment.create({
						userId: user._id,
						year,
						month,
						week,
						installments: userInstallments,
						paymentDate: new Date(year, month - 1, week * 7), // 대략적인 지급일
						paymentStatus: 'paid' // 테스트를 위해 'paid'로 설정
					});
				}
			}
		}
	}

	console.log('\n주차별 지급 데이터 생성 완료');
}

async function generateInstallmentData() {
	try {
		await connectDB();
		console.log('MongoDB 연결 성공');

		// 1. 기존 데이터 정리
		await cleanDatabase();

		// 2. 월별 매출 생성
		const revenues = await createRevenues();

		// 3. 지급 스케줄 생성 (10회 분할)
		const schedules = await createPaymentSchedules(revenues);

		// 4. 주차별 사용자 지급 데이터 생성
		await createWeeklyPayments();

		// 5. 통계 출력
		console.log('\n=== 생성 완료 ===');
		const revenueCount = await Revenue.countDocuments();
		const scheduleCount = await PaymentSchedule.countDocuments();
		const paymentCount = await WeeklyPayment.countDocuments();

		console.log(`- 매출 데이터: ${revenueCount}개월`);
		console.log(`- 지급 스케줄: ${scheduleCount}개`);
		console.log(`- 주차별 지급: ${paymentCount}개`);

		// 샘플 데이터 확인
		console.log('\n=== 2025년 10월 1주차 지급 내역 샘플 ===');
		const samplePayments = await WeeklyPayment.getWeeklyPayments(2025, 10, 1);
		samplePayments.slice(0, 3).forEach(payment => {
			console.log(`- ${payment.userId.name} (${payment.userId.grade}): ${payment.totalAmount.toLocaleString()}원 (세후: ${payment.netAmount.toLocaleString()}원)`);
			payment.installments.forEach(inst => {
				console.log(`  → ${inst.revenueYear}년 ${inst.revenueMonth}월 매출 ${inst.installmentNumber}회차: ${inst.amount.toLocaleString()}원`);
			});
		});

	} catch (error) {
		console.error('오류 발생:', error);
	} finally {
		await mongoose.disconnect();
		console.log('\nMongoDB 연결 종료');
	}
}

// 스크립트 실행
generateInstallmentData();