#!/usr/bin/env node

/**
 * 데이터베이스를 리셋하고 새로운 방식으로 엑셀 업로드 테스트
 */

import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// MongoDB 연결 정보
const MONGO_URL = 'mongodb://localhost:27017/nanumpay';

// 서버 URL
const SERVER_URL = 'http://localhost:3100';
const LOGIN_URL = `${SERVER_URL}/api/auth/login`;
const UPLOAD_URL = `${SERVER_URL}/api/admin/users/bulk`;

// 관리자 정보
const ADMIN_INFO = {
	loginId: '관리자',
	password: '1234',
	passwordHash: null
};

async function resetDatabase() {
	console.log('🔄 데이터베이스 리셋 중...');

	const client = new MongoClient(MONGO_URL);

	try {
		await client.connect();
		const db = client.db();

		// users 컬렉션 비우기 (관리자 제외)
		await db.collection('users').deleteMany({ type: 'user' });
		console.log('  ✅ users 컬렉션 초기화 완료');

		// 관리자 계정 확인/생성
		const adminExists = await db.collection('admins').findOne({ loginId: '관리자' });
		if (!adminExists) {
			ADMIN_INFO.passwordHash = await bcrypt.hash(ADMIN_INFO.password, 10);
			await db.collection('admins').insertOne({
				loginId: ADMIN_INFO.loginId,
				passwordHash: ADMIN_INFO.passwordHash,
				name: '관리자',
				isAdmin: true,
				createdAt: new Date()
			});
			console.log('  ✅ 관리자 계정 생성 완료');
		} else {
			console.log('  ✅ 관리자 계정 확인 완료');
		}

	} finally {
		await client.close();
	}
}

async function login() {
	console.log('\n🔐 관리자 로그인 중...');
	const response = await fetch(LOGIN_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			loginId: ADMIN_INFO.loginId,
			password: ADMIN_INFO.password
		}),
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`로그인 실패: ${error}`);
	}

	const cookies = response.headers.get('set-cookie');
	const data = await response.json();

	let token = null;
	if (cookies) {
		const tokenMatch = cookies.match(/token=([^;]+)/);
		if (tokenMatch) {
			token = tokenMatch[1];
		}
	}

	if (!token && data.token) {
		token = data.token;
	}

	console.log('  ✅ 로그인 성공');
	return token;
}

async function readExcelFile(filePath) {
	console.log(`\n📖 Excel 파일 읽기: ${path.basename(filePath)}`);

	const fullPath = path.join(__dirname, filePath);
	if (!fs.existsSync(fullPath)) {
		throw new Error(`파일을 찾을 수 없습니다: ${fullPath}`);
	}

	const workbook = XLSX.readFile(fullPath);
	const sheetName = workbook.SheetNames[0];
	const worksheet = workbook.Sheets[sheetName];

	const jsonData = XLSX.utils.sheet_to_json(worksheet);
	console.log(`  - ${jsonData.length}개 행 발견`);

	return jsonData;
}

async function uploadUsers(users, token, fileName) {
	console.log(`\n📤 ${fileName} 업로드 중 (${users.length}명)...`);

	const response = await fetch(UPLOAD_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Cookie': `token=${token}`
		},
		body: JSON.stringify({ users }),
	});

	const result = await response.json();

	if (!response.ok) {
		console.error('  ❌ 업로드 실패:', result);
		return false;
	}

	console.log('  ✅ 업로드 성공:');
	console.log(`    - 등록: ${result.created}명`);
	console.log(`    - 실패: ${result.failed}명`);

	if (result.treeStructure) {
		console.log('\n  📊 트리 구조:');
		console.log(`    - 전체 노드: ${result.treeStructure.totalNodes}개`);
		console.log(`    - 직접 배치: ${result.treeStructure.directPlacements}개`);
		console.log(`    - 간접 배치: ${result.treeStructure.indirectPlacements}개`);
		console.log(`    - 자동 배치: ${result.treeStructure.autoPlaced}개`);
	}

	if (result.errors && result.errors.length > 0) {
		console.log('\n  ⚠️ 오류 내역:');
		result.errors.slice(0, 5).forEach(err => console.log(`    - ${err}`));
		if (result.errors.length > 5) {
			console.log(`    ... 외 ${result.errors.length - 5}개 오류`);
		}
	}

	if (result.alerts && result.alerts.length > 0) {
		console.log('\n  📢 알림:');
		result.alerts.slice(0, 5).forEach(alert => console.log(`    - ${alert.message}`));
		if (result.alerts.length > 5) {
			console.log(`    ... 외 ${result.alerts.length - 5}개 알림`);
		}
	}

	return true;
}

async function verifyTreeStructure() {
	console.log('\n🌳 트리 구조 검증 중...');

	const client = new MongoClient(MONGO_URL);

	try {
		await client.connect();
		const db = client.db();

		// 전체 사용자 수
		const totalUsers = await db.collection('users').countDocuments({ type: 'user' });
		console.log(`  - 전체 사용자: ${totalUsers}명`);

		// 루트 노드
		const rootUsers = await db.collection('users').find({
			parentId: null,
			type: 'user'
		}).toArray();
		console.log(`  - 루트 노드: ${rootUsers.length}명`);
		if (rootUsers.length > 0) {
			rootUsers.forEach(root => {
				console.log(`    • ${root.name} (${root.loginId})`);
			});
		}

		// 배치되지 않은 사용자 (부모가 있지만 position이 없는 경우)
		const unplacedUsers = await db.collection('users').find({
			parentId: { $ne: null },
			position: null,
			type: 'user'
		}).toArray();

		if (unplacedUsers.length > 0) {
			console.log(`  - ⚠️ 배치되지 않은 사용자: ${unplacedUsers.length}명`);
		}

		// 레벨별 사용자 수 (대략적인 계산)
		const levels = {};
		const queue = [...rootUsers.map(r => ({ user: r, level: 0 }))];
		const visited = new Set();

		while (queue.length > 0) {
			const { user, level } = queue.shift();

			if (visited.has(user.loginId)) continue;
			visited.add(user.loginId);

			levels[level] = (levels[level] || 0) + 1;

			// 자식 노드 찾기
			if (user.leftChildId) {
				const leftChild = await db.collection('users').findOne({ loginId: user.leftChildId });
				if (leftChild) {
					queue.push({ user: leftChild, level: level + 1 });
				}
			}

			if (user.rightChildId) {
				const rightChild = await db.collection('users').findOne({ loginId: user.rightChildId });
				if (rightChild) {
					queue.push({ user: rightChild, level: level + 1 });
				}
			}
		}

		console.log('\n  📊 레벨별 분포:');
		Object.keys(levels).sort((a, b) => a - b).forEach(level => {
			console.log(`    - 레벨 ${level}: ${levels[level]}명`);
		});

	} finally {
		await client.close();
	}
}

async function main() {
	try {
		console.log('🚀 새로운 엑셀 업로드 방식 테스트\n');
		console.log('특징: 모든 사용자를 먼저 등록 후, 스마트 트리 재구성');
		console.log('='.repeat(60));

		// 1. 데이터베이스 리셋
		await resetDatabase();

		// 2. 로그인
		const token = await login();

		// 3. 모든 엑셀 파일 한 번에 읽기
		const allUsers = [];
		const files = [
			'../test-data/7월_용역자명단.xlsx',
			'../test-data/8월_용역자명단.xlsx',
			'../test-data/9월_용역자명단.xlsx'
		];

		for (const file of files) {
			const users = await readExcelFile(file);
			allUsers.push(...users);
		}

		console.log(`\n📊 전체 통계:`);
		console.log(`  - 총 ${allUsers.length}명의 사용자 데이터 준비 완료`);

		// 4. 한 번에 업로드 (스마트 트리 재구성 포함)
		const success = await uploadUsers(allUsers, token, '전체 데이터');

		if (success) {
			// 5. 트리 구조 검증
			await verifyTreeStructure();

			console.log('\n✨ 테스트 완료!');
			console.log('모든 사용자가 성공적으로 등록되고 트리 구조가 자동으로 구성되었습니다.');
		} else {
			console.error('\n❌ 테스트 실패');
		}

	} catch (error) {
		console.error('\n❌ 테스트 실패:', error.message);
		console.error(error.stack);
		process.exit(1);
	}
}

// 실행
main();