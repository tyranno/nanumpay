import { connectDB } from '../src/lib/server/db.js';
import User from '../src/lib/server/models/User.js';
import PaymentService from '../src/lib/server/services/paymentService.js';
import { MonthlyRevenue, WeeklyPayment } from '../src/lib/server/models/Payment.js';
import mongoose from 'mongoose';

async function generateSeptemberData() {
	try {
		console.log('Starting September data generation...');

		// DB 연결
		await connectDB();
		console.log('Database connected');

		// 9월 설정
		const year = 2025;
		const month = 9;

		// 기존 9월 데이터 삭제 (필요 시)
		const deleteExisting = process.argv.includes('--clean');
		if (deleteExisting) {
			console.log('Cleaning existing September data...');
			await MonthlyRevenue.deleteMany({ year, month });
			await WeeklyPayment.deleteMany({ year, month });
			console.log('Existing data cleaned');
		}

		// 현재 F1 등급 사용자 수 확인
		const f1Users = await User.find({ grade: 'F1' }).lean();
		console.log(`Found ${f1Users.length} F1 grade users`);

		if (f1Users.length === 0) {
			console.log('No F1 users found. Creating test users...');

			// 테스트 사용자 생성
			const testUsers = [
				{ name: '홍길동', phone: '01012345678', grade: 'F1', bank: '하나', accountNumber: '1002-066-361313' },
				{ name: '김철수', phone: '01023456789', grade: 'F1', bank: '하나', accountNumber: '1002-066-361212' },
				{ name: '이영희', phone: '01034567890', grade: 'F1', bank: 'KB', accountNumber: '345-546-123456' },
				{ name: '박민수', phone: '01045678901', grade: 'F1', bank: '신한', accountNumber: '345-546-123457' },
				{ name: '정수진', phone: '01056789012', grade: 'F1', bank: '우리', accountNumber: '345-546-123458' },
			];

			for (const userData of testUsers) {
				// 9월 1일로 생성일 설정
				const user = new User({
					...userData,
					createdAt: new Date(year, month - 1, 1),
					role: 'user'
				});
				await user.save();
				console.log(`Created user: ${userData.name}`);
			}
		}

		// 모든 F1 사용자를 9월 추가로 가정하고 createdAt 업데이트
		const updateResult = await User.updateMany(
			{ grade: 'F1' },
			{
				$set: {
					createdAt: new Date(year, month - 1, 1)
				}
			}
		);
		console.log(`Updated ${updateResult.modifiedCount} users' createdAt to September`);

		// 월별 매출 계산
		console.log('\nCalculating monthly revenue...');
		const monthlyRevenue = await PaymentService.calculateMonthlyRevenue(year, month);
		console.log(`Monthly revenue calculated: ${monthlyRevenue.totalRevenue.toLocaleString()}원`);
		console.log('Grade distribution:');
		for (const [grade, info] of Object.entries(monthlyRevenue.gradeDistribution)) {
			if (info.count > 0) {
				console.log(`  ${grade}: ${info.count}명, ${info.totalAmount.toLocaleString()}원`);
			}
		}

		// 10주차 지급 데이터 생성
		console.log('\nGenerating weekly payments...');
		for (let week = 1; week <= 10; week++) {
			console.log(`  Generating week ${week} payment...`);

			const weeklyPayment = await PaymentService.calculateWeeklyPayments(year, month, week);

			// 상태를 completed로 변경
			weeklyPayment.status = 'completed';
			await weeklyPayment.save();

			console.log(`    Week ${week}: ${weeklyPayment.payments.length}명, 총 ${weeklyPayment.totalPayment.toLocaleString()}원`);
		}

		// 생성된 데이터 요약
		console.log('\n=== September Data Generation Complete ===');
		console.log(`Year: ${year}, Month: ${month}`);
		console.log(`Total Revenue: ${monthlyRevenue.totalRevenue.toLocaleString()}원`);
		console.log(`New Members: ${monthlyRevenue.newMembers}명`);

		const weeklyPayments = await WeeklyPayment.find({ year, month }).sort({ week: 1 });
		const totalPaid = weeklyPayments.reduce((sum, w) => sum + w.totalPayment, 0);
		console.log(`Total Payments (10 weeks): ${totalPaid.toLocaleString()}원`);

		// 샘플 데이터 출력
		const sampleWeek = await WeeklyPayment.findOne({ year, month, week: 1 }).lean();
		if (sampleWeek && sampleWeek.payments.length > 0) {
			console.log('\nSample payment (Week 1, First user):');
			const sample = sampleWeek.payments[0];
			console.log(`  Name: ${sample.userName}`);
			console.log(`  Grade: ${sample.grade}`);
			console.log(`  Amount: ${sample.actualAmount.toLocaleString()}원`);
			console.log(`  Tax: ${sample.taxAmount.toLocaleString()}원`);
			console.log(`  Net: ${sample.netAmount.toLocaleString()}원`);
		}

		console.log('\nScript completed successfully!');

	} catch (error) {
		console.error('Error generating September data:', error);
		process.exit(1);
	} finally {
		await mongoose.disconnect();
		console.log('Database disconnected');
	}
}

// 스크립트 실행
generateSeptemberData().then(() => {
	process.exit(0);
}).catch(error => {
	console.error('Script failed:', error);
	process.exit(1);
});