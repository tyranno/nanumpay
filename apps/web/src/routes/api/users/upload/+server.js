import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import User from '$lib/server/models/User.js';
import { treeService } from '$lib/server/services/treeService.js';
import { batchProcessor } from '$lib/server/services/batchProcessor.js';
import bcrypt from 'bcryptjs';
import * as XLSX from 'xlsx';

// POST: 엑셀 파일 업로드 및 사용자 일괄 등록
export async function POST({ request, locals }) {
	try {
		await db();

		// FormData에서 파일 추출
		const formData = await request.formData();
		const file = formData.get('file');

		if (!file || !file.name.endsWith('.xlsx')) {
			return json({ error: '올바른 엑셀 파일을 선택해주세요.' }, { status: 400 });
		}

		// 파일을 ArrayBuffer로 변환
		const arrayBuffer = await file.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);

		// 엑셀 파일 파싱
		const workbook = XLSX.read(buffer, { type: 'buffer' });
		const sheetName = workbook.SheetNames[0];
		const worksheet = workbook.Sheets[sheetName];
		const data = XLSX.utils.sheet_to_json(worksheet);

		// 결과 저장용
		const results = {
			success: [],
			failed: [],
			warnings: []
		};

		// 새로 등록된 사용자 ID 수집용
		const newUserIds = [];

		// 데이터 처리
		for (const row of data) {
			try {
				// 엑셀 컬럼 매핑
				const userData = {
					name: row['이름'] || row['성명'] || '',
					phone: row['전화번호'] || row['연락처'] || '',
					nickname: row['닉네임'] || '',
					residentNumber: row['주민번호'] || '',
					bank: row['은행'] || '',
					accountNumber: row['계좌번호'] || row['계좌'] || '',
					insurance: row['보험'] || '',
					insuranceCompany: row['보험회사'] || '',
					branch: row['소속/지사'] || row['지사'] || '',
					designer: row['설계사'] || '',
					designerPhone: row['설계사 전화번호'] || '',
					seller: row['판매인'] || row['추천인'] || '',
					sellerPhone: row['판매인 전화번호'] || ''
				};

				// 필수 필드 검증
				if (!userData.name) {
					results.failed.push({
						row: row,
						error: '이름이 없습니다.'
					});
					continue;
				}

				// 사용자 생성
				const user = await createUserFromExcel(userData);
				newUserIds.push(user._id); // 새로 생성된 사용자 ID 수집
				results.success.push({
					name: user.name,
					loginId: user.loginId,
					grade: user.grade
				});

			} catch (error) {
				results.failed.push({
					name: row['이름'] || 'Unknown',
					error: error.message
				});
			}
		}

		// 전체 사용자 등급 재계산
		await recalculateAllGrades();

		// 배치 처리 실행 (등급 재계산, 매출 계산, 지급 계획 생성)
		if (newUserIds.length > 0) {
			try {
				await batchProcessor.processNewUsers(newUserIds);
				console.log(`엑셀 업로드: ${newUserIds.length}명에 대한 배치 처리 완료`);
			} catch (batchError) {
				console.error('배치 처리 오류:', batchError);
				results.warnings.push('사용자는 등록되었으나 지급 계획 생성 중 오류가 발생했습니다.');
			}
		}

		return json({
			success: true,
			message: `성공: ${results.success.length}명, 실패: ${results.failed.length}명`,
			results
		});

	} catch (error) {
		console.error('Excel upload error:', error);
		return json({ error: error.message }, { status: 500 });
	}
}

// 엑셀 데이터로 사용자 생성
async function createUserFromExcel(data) {
	// loginId 생성
	let loginId = data.name.toLowerCase().replace(/\s+/g, '');
	let suffix = '';
	let counter = 0;

	// 중복 체크
	while (true) {
		const existing = await User.findOne({ loginId: loginId + suffix });
		if (!existing) break;
		counter++;
		suffix = String.fromCharCode(64 + counter); // A, B, C...
		if (counter > 26) {
			suffix = counter.toString();
		}
	}
	loginId = loginId + suffix;

	// 비밀번호 생성 (전화번호 뒤 4자리)
	let password = '1234'; // 기본값
	if (data.phone) {
		const cleaned = data.phone.replace(/[^0-9]/g, '');
		if (cleaned.length >= 4) {
			password = cleaned.slice(-4);
		}
	}
	const passwordHash = await bcrypt.hash(password, 10);

	// 부모 찾기
	let parentId = null;
	let position = null;
	let level = 1;

	if (data.seller) {
		// 판매인 찾기
		const parent = await User.findOne({
			$or: [
				{ name: data.seller },
				{ loginId: data.seller.toLowerCase() }
			]
		});

		if (parent) {
			parentId = parent._id;
			level = parent.level + 1;

			// 빈 위치 찾기
			const leftChild = await User.findOne({ parentId: parent._id, position: 'L' });
			const rightChild = await User.findOne({ parentId: parent._id, position: 'R' });

			if (!leftChild) {
				position = 'L';
				parent.leftChildId = null; // 새 사용자가 저장된 후 업데이트됨
			} else if (!rightChild) {
				position = 'R';
				parent.rightChildId = null; // 새 사용자가 저장된 후 업데이트됨
			} else {
				// 자리가 없으면 자동으로 하위 노드 중 빈 자리 찾기
				const emptySpot = await findEmptyPosition(parent._id);
				if (emptySpot) {
					parentId = emptySpot.parentId;
					position = emptySpot.position;
					const spotParent = await User.findById(parentId);
					level = spotParent.level + 1;
				} else {
					throw new Error(`${data.seller}의 조직에 빈 자리가 없습니다.`);
				}
			}
		}
	}

	// 사용자 생성
	const user = new User({
		name: data.name,
		loginId,
		passwordHash,
		phone: data.phone,
		parentId,
		position,
		level,
		nickname: data.nickname,
		residentNumber: data.residentNumber,
		bank: data.bank,
		accountNumber: data.accountNumber,
		insurance: data.insurance,
		insuranceCompany: data.insuranceCompany,
		branch: data.branch,
		designer: data.designer,
		designerPhone: data.designerPhone,
		seller: data.seller,
		sellerPhone: data.sellerPhone
	});

	await user.save();

	// 부모 노드 업데이트
	if (parentId) {
		const parent = await User.findById(parentId);
		if (position === 'L') {
			parent.leftChildId = user._id;
		} else {
			parent.rightChildId = user._id;
		}
		await parent.save();
	}

	// TreeStats 생성
	await treeService.onUserAdded(user._id);

	return user;
}

// BFS로 빈 자리 찾기
async function findEmptyPosition(rootId) {
	const queue = [rootId];
	const visited = new Set();

	while (queue.length > 0) {
		const userId = queue.shift();
		if (visited.has(userId.toString())) continue;
		visited.add(userId.toString());

		const user = await User.findById(userId);
		if (!user) continue;

		// 왼쪽 자리 확인
		const leftChild = await User.findOne({ parentId: userId, position: 'L' });
		if (!leftChild) {
			return { parentId: userId, position: 'L' };
		}
		queue.push(leftChild._id);

		// 오른쪽 자리 확인
		const rightChild = await User.findOne({ parentId: userId, position: 'R' });
		if (!rightChild) {
			return { parentId: userId, position: 'R' };
		}
		queue.push(rightChild._id);
	}

	return null;
}

// 전체 사용자 등급 재계산
async function recalculateAllGrades() {
	// TreeService를 통한 전체 재계산
	await treeService.recalculateEntireTree();
}