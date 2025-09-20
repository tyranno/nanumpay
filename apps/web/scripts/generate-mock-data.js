import { connectDB } from '../src/lib/server/db.js';
import User from '../src/lib/server/models/User.js';
import PaymentService from '../src/lib/server/services/paymentService.js';
import { MonthlyRevenue, WeeklyPayment } from '../src/lib/server/models/Payment.js';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

// 한국 성씨 및 이름 데이터
const lastNames = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '전', '홍'];
const firstNames = [
	'민준', '서준', '도윤', '예준', '시우', '하준', '주원', '지호', '지후', '준우',
	'지훈', '도현', '건우', '우진', '선우', '서진', '민재', '현우', '준서', '정우',
	'지원', '수아', '지우', '서윤', '서연', '하은', '하윤', '민서', '지유', '윤서',
	'채원', '수빈', '다은', '예은', '수민', '지민', '소율', '예린', '유진', '채은'
];

const banks = ['KB국민', '신한', '하나', '우리', '농협', 'SC제일', '기업', '씨티', '산업', '카카오뱅크'];

// 랜덤 데이터 생성 함수들
function getRandomName() {
	const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
	const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
	return lastName + firstName;
}

function getRandomPhone() {
	const middle = Math.floor(Math.random() * 9000) + 1000;
	const last = Math.floor(Math.random() * 9000) + 1000;
	return `010${middle}${last}`;
}

function getRandomBank() {
	return banks[Math.floor(Math.random() * banks.length)];
}

function getRandomAccount() {
	const part1 = Math.floor(Math.random() * 9000) + 1000;
	const part2 = Math.floor(Math.random() * 900) + 100;
	const part3 = Math.floor(Math.random() * 900000) + 100000;
	return `${part1}-${part2}-${part3}`;
}

function getRandomIdNumber() {
	const year = Math.floor(Math.random() * 30) + 70; // 70-99
	const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
	const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
	const suffix = Math.floor(Math.random() * 9000000) + 1000000;
	return `${year}${month}${day}-${suffix}`;
}

// 계층 구조를 위한 재귀 함수
async function createUserWithChildren(parentData, depth = 0, maxDepth = 4) {
	if (depth > maxDepth) return null;

	// 부모 사용자 생성
	const parent = new User({
		...parentData,
		passwordHash: await bcrypt.hash(parentData.phone.slice(-4), 10),
		status: 'active',
		balance: 0,
		totalEarnings: 0,
		joinedAt: new Date(2025, 8, Math.floor(Math.random() * 15) + 1) // 9월 1일-15일 사이
	});

	await parent.save();
	console.log(`${'  '.repeat(depth)}Created: ${parent.name} (${parent.grade || 'F1'})`);

	// 자식 생성 확률 (깊이가 깊어질수록 감소)
	const createChildProbability = Math.max(0.3, 0.9 - depth * 0.2);

	// 왼쪽 자식
	if (Math.random() < createChildProbability) {
		const leftChildData = {
			name: getRandomName(),
			loginId: getRandomName().toLowerCase() + Math.floor(Math.random() * 100),
			phone: getRandomPhone(),
			email: `user${Math.floor(Math.random() * 10000)}@example.com`,
			bank: getRandomBank(),
			accountNumber: getRandomAccount(),
			idNumber: getRandomIdNumber(),
			parentId: parent._id,
			position: 'L',
			salesperson: parent.name,
			salespersonPhone: parent.phone
		};

		const leftChild = await createUserWithChildren(leftChildData, depth + 1, maxDepth);
		if (leftChild) {
			parent.leftChildId = leftChild._id;
			await parent.save();
		}
	}

	// 오른쪽 자식
	if (Math.random() < createChildProbability) {
		const rightChildData = {
			name: getRandomName(),
			loginId: getRandomName().toLowerCase() + Math.floor(Math.random() * 100),
			phone: getRandomPhone(),
			email: `user${Math.floor(Math.random() * 10000)}@example.com`,
			bank: getRandomBank(),
			accountNumber: getRandomAccount(),
			idNumber: getRandomIdNumber(),
			parentId: parent._id,
			position: 'R',
			salesperson: parent.name,
			salespersonPhone: parent.phone
		};

		const rightChild = await createUserWithChildren(rightChildData, depth + 1, maxDepth);
		if (rightChild) {
			parent.rightChildId = rightChild._id;
			await parent.save();
		}
	}

	return parent;
}

// 등급 계산 및 업데이트
async function updateUserGrades() {
	console.log('\nUpdating user grades based on tree structure...');

	const users = await User.find({}).lean();

	for (const user of users) {
		let grade = 'F1'; // 기본 등급

		// 자식이 둘 다 있으면 F2
		if (user.leftChildId && user.rightChildId) {
			grade = 'F2';

			// 더 높은 등급 체크 (간단한 로직)
			const leftChild = await User.findById(user.leftChildId).lean();
			const rightChild = await User.findById(user.rightChildId).lean();

			if (leftChild && rightChild) {
				// 자식들도 각각 자식이 있으면 F3
				if ((leftChild.leftChildId || leftChild.rightChildId) &&
					(rightChild.leftChildId || rightChild.rightChildId)) {
					grade = 'F3';

					// 랜덤하게 일부를 더 높은 등급으로
					const random = Math.random();
					if (random < 0.3) grade = 'F4';
					if (random < 0.15) grade = 'F5';
					if (random < 0.08) grade = 'F6';
					if (random < 0.04) grade = 'F7';
					if (random < 0.02) grade = 'F8';
				}
			}
		} else if (user.leftChildId || user.rightChildId) {
			// 자식이 하나만 있어도 F1 유지
			grade = 'F1';
		}

		// 등급 업데이트
		await User.findByIdAndUpdate(user._id, { grade });
	}

	// 등급별 통계 출력
	const gradeStats = await User.aggregate([
		{ $group: { _id: '$grade', count: { $sum: 1 } } },
		{ $sort: { _id: 1 } }
	]);

	console.log('Grade distribution:');
	for (const stat of gradeStats) {
		console.log(`  ${stat._id || 'N/A'}: ${stat.count} users`);
	}
}

async function generateMockData() {
	try {
		console.log('Starting mock data generation...');
		console.log('=====================================\n');

		// DB 연결
		await connectDB();
		console.log('✓ Database connected\n');

		// 기존 데이터 삭제 옵션
		const cleanData = process.argv.includes('--clean');
		if (cleanData) {
			console.log('Cleaning existing data...');
			await User.deleteMany({});
			await MonthlyRevenue.deleteMany({});
			await WeeklyPayment.deleteMany({});
			console.log('✓ Existing data cleaned\n');
		}

		// 관리자 계정 생성 (없으면)
		const adminExists = await User.findOne({ loginId: 'admin' });
		if (!adminExists) {
			const admin = new User({
				name: '관리자',
				loginId: 'admin',
				passwordHash: await bcrypt.hash('admin123', 10),
				phone: '01000000000',
				email: 'admin@nanumpay.com',
				status: 'active',
				joinedAt: new Date(2025, 0, 1)
			});
			await admin.save();
			console.log('✓ Admin account created\n');
		}

		// 트리 구조로 사용자 생성
		console.log('Creating hierarchical user structure...');
		console.log('---------------------------------------');

		// 5개의 독립적인 트리 생성 (각 트리의 루트)
		const rootUsers = [];
		for (let i = 1; i <= 5; i++) {
			const rootData = {
				name: getRandomName(),
				loginId: `root${i}`,
				phone: getRandomPhone(),
				email: `root${i}@example.com`,
				bank: getRandomBank(),
				accountNumber: getRandomAccount(),
				idNumber: getRandomIdNumber(),
				insuranceCompany: '삼성생명',
				insuranceProduct: '종신보험',
				branch: `서울 ${i}지점`,
				planner: getRandomName(),
				plannerPhone: getRandomPhone()
			};

			console.log(`\nTree ${i}:`);
			const root = await createUserWithChildren(rootData, 0, 3);
			rootUsers.push(root);
		}

		// 추가 독립 사용자들 (트리에 속하지 않는)
		console.log('\nCreating standalone users...');
		for (let i = 0; i < 20; i++) {
			const user = new User({
				name: getRandomName(),
				loginId: `user${i}`,
				passwordHash: await bcrypt.hash('1234', 10),
				phone: getRandomPhone(),
				email: `standalone${i}@example.com`,
				bank: getRandomBank(),
				accountNumber: getRandomAccount(),
				idNumber: getRandomIdNumber(),
				grade: 'F1',
				status: 'active',
				joinedAt: new Date(2025, 8, Math.floor(Math.random() * 30) + 1)
			});
			await user.save();
		}
		console.log('✓ Created 20 standalone users\n');

		// 등급 업데이트
		await updateUserGrades();

		// 사용자 통계
		const totalUsers = await User.countDocuments({});
		console.log(`\n✓ Total users created: ${totalUsers}\n`);

		// 9월과 10월 데이터 생성
		console.log('Generating payment data for September & October 2025...');
		console.log('------------------------------------------------------');

		for (const monthData of [
			{ year: 2025, month: 9, name: 'September' },
			{ year: 2025, month: 10, name: 'October' }
		]) {
			console.log(`\n${monthData.name} ${monthData.year}:`);

			// 월별 매출 계산
			const monthlyRevenue = await PaymentService.calculateMonthlyRevenue(monthData.year, monthData.month);
			console.log(`  Total Revenue: ${monthlyRevenue.totalRevenue.toLocaleString()}원`);
			console.log(`  New Members: ${monthlyRevenue.newMembers}`);

			// 주별 지급 데이터 생성
			for (let week = 1; week <= 10; week++) {
				const weeklyPayment = await PaymentService.calculateWeeklyPayments(
					monthData.year,
					monthData.month,
					week
				);

				// 9월은 completed, 10월은 1-2주차만 completed
				if (monthData.month === 9 || week <= 2) {
					weeklyPayment.status = 'completed';
				} else {
					weeklyPayment.status = 'pending';
				}

				await weeklyPayment.save();

				if (week === 1 || week === 5 || week === 10) {
					console.log(`  Week ${week}: ${weeklyPayment.payments.length} payments, Total: ${weeklyPayment.totalPayment.toLocaleString()}원`);
				}
			}
		}

		// 최종 요약
		console.log('\n=====================================');
		console.log('MOCK DATA GENERATION COMPLETE');
		console.log('=====================================');

		// 샘플 유저 정보 출력
		const sampleUsers = await User.find({}).limit(5).lean();
		console.log('\nSample Users (for testing):');
		for (const user of sampleUsers) {
			console.log(`  ID: ${user.loginId}, PW: ${user.phone.slice(-4)}, Name: ${user.name}, Grade: ${user.grade || 'F1'}`);
		}

		console.log('\n✓ All mock data generated successfully!');
		console.log('You can now login and view the payment data.\n');

	} catch (error) {
		console.error('\n✗ Error generating mock data:', error);
		process.exit(1);
	} finally {
		await mongoose.disconnect();
		console.log('Database disconnected');
	}
}

// 스크립트 실행
generateMockData().then(() => {
	process.exit(0);
}).catch(error => {
	console.error('Script failed:', error);
	process.exit(1);
});