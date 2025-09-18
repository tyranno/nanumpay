import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .env 파일 로드
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// MongoDB 연결
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/nanumpay';

// User 모델 정의
const userSchema = new mongoose.Schema({
	name: { type: String, required: true },
	loginId: { type: String, required: true, unique: true },
	passwordHash: { type: String, required: true },
	phone: String,
	idNumber: String,
	bank: String,
	accountNumber: String,
	salesperson: String,
	salespersonPhone: String,
	planner: String,
	plannerPhone: String,
	insuranceProduct: String,
	insuranceCompany: String,
	branch: String,
	parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
	position: { type: String, enum: ['L', 'R'], default: null },
	leftChildId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
	rightChildId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
	rootAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
	level: { type: Number, default: 1 },
	status: { type: String, default: 'active' },
	createdAt: { type: Date, default: Date.now }
});

// Admin 모델 정의
const adminSchema = new mongoose.Schema({
	name: { type: String, required: true },
	loginId: { type: String, required: true, unique: true },
	passwordHash: { type: String, required: true },
	email: String,
	phone: String,
	permissions: [String],
	createdAt: { type: Date, default: Date.now }
});

const User = mongoose.models.User || mongoose.model('User', userSchema);
const Admin = mongoose.models.Admin || mongoose.model('Admin', adminSchema);

let rootAdmin = null;

// 사용자 생성 함수 (새로운 규칙 적용)
async function createUser(name, parentId = null, position = null) {
	// 전화번호 생성
	const phone = `010-${Math.floor(Math.random() * 9000) + 1000}-${Math.floor(Math.random() * 9000) + 1000}`;
	const phoneDigits = phone.replace(/[^0-9]/g, '');
	const password = phoneDigits.slice(-4);

	// loginId 자동 생성 (한글 이름 사용)
	let baseLoginId = name.toLowerCase();
	let loginId = baseLoginId;
	let counter = 0;

	while (await User.exists({ loginId })) {
		counter++;
		const suffix = counter <= 26
			? String.fromCharCode(64 + counter)  // A, B, C, ...
			: counter.toString();  // 27, 28, ...
		loginId = baseLoginId + suffix;
	}

	const passwordHash = await bcrypt.hash(password, 10);

	// 부모가 있으면 판매인으로 설정
	let salesperson = '';
	if (parentId) {
		const parent = await User.findById(parentId);
		if (parent) {
			salesperson = parent.name;
		}
	}

	const user = new User({
		name,
		loginId,
		passwordHash,
		phone,
		idNumber: `${Math.floor(Math.random() * 900000) + 100000}-${Math.floor(Math.random() * 9000000) + 1000000}`,
		bank: ['하나', '국민', '신한', '우리'][Math.floor(Math.random() * 4)],
		accountNumber: `${Math.floor(Math.random() * 900) + 100}-${Math.floor(Math.random() * 9000) + 1000}-${Math.floor(Math.random() * 90000) + 10000}`,
		salesperson,
		salespersonPhone: salesperson ? `010-${Math.floor(Math.random() * 9000) + 1000}-${Math.floor(Math.random() * 9000) + 1000}` : '',
		planner: ['김설계', '이설계', '박설계', '최설계'][Math.floor(Math.random() * 4)],
		plannerPhone: `010-${Math.floor(Math.random() * 9000) + 1000}-${Math.floor(Math.random() * 9000) + 1000}`,
		insuranceProduct: ['건강플러스', '종신보험', '연금저축', '변액보험'][Math.floor(Math.random() * 4)],
		insuranceCompany: ['삼성생명', '한화생명', '교보생명', 'KB생명'][Math.floor(Math.random() * 4)],
		branch: ['서울', '경기', '인천', '부산'][Math.floor(Math.random() * 4)],
		parentId,
		position,
		rootAdminId: rootAdmin ? rootAdmin._id : null,
		level: 1
	});

	const savedUser = await user.save();
	console.log(`User created: ${name} (ID: ${loginId}, Password: ${password})`);

	// 부모 노드의 자식 참조 업데이트
	if (parentId && position) {
		const updateField = position === 'L' ? 'leftChildId' : 'rightChildId';
		await User.findByIdAndUpdate(parentId, {
			[updateField]: savedUser._id
		});

		// 부모가 2개의 자식을 가지게 되었는지 확인
		const updatedParent = await User.findById(parentId);
		if (updatedParent && updatedParent.leftChildId && updatedParent.rightChildId) {
			console.log(`✅ 알림: ${updatedParent.name}님이 2개의 하위 노드를 모두 채웠습니다.`);
		}
	}

	return savedUser;
}

async function seedDatabase() {
	try {
		// MongoDB 연결
		await mongoose.connect(MONGODB_URI);
		console.log('MongoDB connected');

		// 기존 데이터 삭제
		await User.deleteMany({});
		await Admin.deleteMany({});
		console.log('Existing data cleared');

		// 관리자 계정 생성
		const adminPassword = await bcrypt.hash('1234', 10);
		rootAdmin = await Admin.create({
			name: '홍관리',
			loginId: '홍관리',
			passwordHash: adminPassword,
			email: 'admin@nanumpay.com',
			phone: '010-1234-5678',
			permissions: ['all']
		});
		console.log('Admin created: 홍관리 (Password: 1234)');

		// 계층 구조 사용자 생성
		console.log('\n=== Creating User Hierarchy ===\n');

		// 루트 사용자 생성 (관리자가 관리하는 최상위 사용자)
		const rootUser = await createUser('홍길동', null, null);

		// 2단계 사용자 생성
		const user2_1 = await createUser('김철수', rootUser._id, 'L');
		const user2_2 = await createUser('이영희', rootUser._id, 'R');

		// 3단계 사용자 생성
		const user3_1 = await createUser('박민수', user2_1._id, 'L');
		const user3_2 = await createUser('정수진', user2_1._id, 'R');
		const user3_3 = await createUser('최동욱', user2_2._id, 'L');
		const user3_4 = await createUser('강미나', user2_2._id, 'R');

		// 4단계 사용자 생성
		const user4_1 = await createUser('윤서준', user3_1._id, 'L');
		const user4_2 = await createUser('임하늘', user3_1._id, 'R');
		const user4_3 = await createUser('장보검', user3_2._id, 'L');
		const user4_4 = await createUser('송지효', user3_2._id, 'R');
		const user4_5 = await createUser('한소희', user3_3._id, 'L');
		const user4_6 = await createUser('오승환', user3_3._id, 'R');
		const user4_7 = await createUser('배수지', user3_4._id, 'L');
		const user4_8 = await createUser('류현진', user3_4._id, 'R');

		// 5단계 일부 사용자 추가 (테스트용)
		await createUser('김태희', user4_1._id, 'L');
		await createUser('전지현', user4_1._id, 'R');
		await createUser('손예진', user4_2._id, 'L');

		console.log('\n=== Seed Complete ===');
		console.log(`Total Users: ${await User.countDocuments()}`);
		console.log(`Total Admins: ${await Admin.countDocuments()}`);

		// 등급 계산 스크립트 실행
		console.log('\n=== Calculating Grades ===');
		const { exec } = await import('child_process');
		const { promisify } = await import('util');
		const execAsync = promisify(exec);

		try {
			await execAsync('node scripts/calculate-grades.js');
			console.log('Grades calculated successfully');
		} catch (error) {
			console.log('Grade calculation script not found or failed, skipping...');
		}

	} catch (error) {
		console.error('Seed error:', error);
	} finally {
		await mongoose.disconnect();
		console.log('\nDatabase connection closed');
	}
}

// 실행
seedDatabase();