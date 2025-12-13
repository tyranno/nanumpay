import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import { registerUsers } from '$lib/server/services/userRegistrationService.js';

/**
 * 개별 사용자 등록 (v7.0)
 * - 1명짜리 bulk로 처리 (userRegistrationService 사용)
 * - bulk와 동일한 검증 및 트리 재구성 로직 적용
 */
export async function POST({ request, locals }) {
	// 관리자 권한 확인
	if (!locals.user || !locals.user.isAdmin) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	await db();

	try {
		const data = await request.json();
		const {
			ID,
			name,
			phone,
			autoPassword,
			salesperson,
			registrationDate,
			...otherFields
		} = data;

		// 필수 필드 확인
		if (!ID || !name || !phone) {
			return json({ error: 'ID, 이름, 연락처는 필수입니다.' }, { status: 400 });
		}

		// 자기 자신을 판매인으로 등록하는 것 방지
		if (salesperson && salesperson === name) {
			return json({
				error: '자기 자신을 판매인으로 등록할 수 없습니다.'
			}, { status: 400 });
		}

		// 등록날짜 처리 (없으면 오늘 날짜)
		let createdAt = new Date();
		if (registrationDate) {
			createdAt = new Date(registrationDate);
			// 날짜가 유효한지 확인
			if (isNaN(createdAt.getTime())) {
				createdAt = new Date();
			}
		}

		// 암호 설정 (전화번호 뒤 4자리 또는 지정된 암호)
		const password = autoPassword || (phone.replace(/[^0-9]/g, '').slice(-4) || '1234');

		// 단일 사용자를 배열로 변환 (bulk 형식)
		// ⭐ v8.0: ID, 주민번호 등을 한글 키로 명시적 매핑
		const userData = {
			'ID': ID,
			'성명': name,
			'연락처': phone,
			'판매인': salesperson || '',
			'날짜': createdAt.toISOString(),
			...otherFields
		};

		// ⭐ idNumber가 otherFields에 있으면 '주민번호'로도 추가
		if (otherFields.idNumber) {
			userData['주민번호'] = otherFields.idNumber;
		}

		// ⭐ bank, accountNumber 한글 키로 매핑 (필수 항목)
		if (otherFields.bank) {
			userData['은행'] = otherFields.bank;
		}
		if (otherFields.accountNumber) {
			userData['계좌번호'] = otherFields.accountNumber;
		}

		// ⭐ planner, plannerPhone도 한글 키로 매핑
		if (otherFields.planner) {
			userData['설계사'] = otherFields.planner;
		}
		if (otherFields.plannerPhone) {
			userData['설계사 연락처'] = otherFields.plannerPhone;
		}
		// ⭐ v8.0: 추가 필드 한글 키 매핑
		if (otherFields.ratio !== undefined) {
			userData['비율'] = otherFields.ratio;
		}
		if (otherFields.plannerBank) {
			userData['설계사 은행'] = otherFields.plannerBank;
		}
		if (otherFields.plannerAccountNumber) {
			userData['설계사 계좌번호'] = otherFields.plannerAccountNumber;
		}

		const singleUserArray = [userData];

		// 공통 등록 함수 호출 (1명짜리 bulk, 매번 새 인스턴스)
		const results = await registerUsers(singleUserArray, {
			source: 'register',
			admin: locals.user
		});

		// 등록 실패 시
		if (results.failed > 0 || results.created === 0) {
			const errorMsg = results.errors.length > 0
				? results.errors[0]
				: '사용자 등록 중 오류가 발생했습니다.';

			return json({
				error: errorMsg,
				details: results.errors
			}, { status: 400 });
		}

		// ⭐ 등록된 사용자 정보 추출 (결과에서 직접 가져오기)
		const savedUser = results.users[0];

		return json({
			success: true,
			user: {
				id: savedUser._id,
				name: savedUser.name,
				loginId: ID, // User 모델에는 loginId가 없음, 원래 입력값 사용
				phone: savedUser.phone,
				sequence: savedUser.sequence,
				grade: savedUser.grade
			},
			batchProcessing: results.batchProcessing,
			message: `사용자 등록 완료. ID: ${ID}, 초기 암호: ${password}`
		});

	} catch (error) {
		console.error('User registration error:', error);

		// 검증 오류인 경우
		if (error.message.includes('등록 실패') || error.message.includes('판매인')) {
			return json({
				error: error.message,
				details: error.details || '등록 검증 실패'
			}, { status: 400 });
		}

		// 중복 오류
		if (error.code === 11000) {
			return json({ error: '중복된 데이터가 있습니다.' }, { status: 400 });
		}

		return json({ error: '사용자 등록 중 오류가 발생했습니다.' }, { status: 500 });
	}
}
