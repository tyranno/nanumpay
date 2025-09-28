import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import User from '$lib/server/models/User.js';
import bcrypt from 'bcryptjs';
import { recalculateAllGrades, updateParentGrade } from '$lib/server/services/gradeCalculation.js';
import { excelLogger } from '$lib/server/logger.js';

export async function POST({ request, locals }) {
	// 관리자 권한 확인
	if (!locals.user || !locals.user.isAdmin) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	await db();

	try {
		const { users } = await request.json();

		// 로그 기록 시작
		excelLogger.info('=== 엑셀 업로드 시작 ===', {
			admin: locals.user.name || locals.user.id,
			timestamp: new Date().toISOString(),
			dataCount: users ? users.length : 0,
			sampleData: users ? users.slice(0, 2) : null
		});

		// 엑셀 업로드 시작

		if (!users || !Array.isArray(users)) {
			const error = '데이터 형식 오류';
			excelLogger.error(error, { users, type: typeof users });
			excelLogger.error('데이터 형식 오류', { users, type: typeof users });
			return json({ error: '올바른 데이터 형식이 아닙니다.' }, { status: 400 });
		}

		const results = {
			created: 0,
			failed: 0,
			errors: [],
			alerts: []  // 알림 추가
		};

		// 1단계: 모든 사용자를 먼저 등록 (부모 관계 설정 없이)
		const registeredUsers = new Map(); // loginId -> user 매핑
		const usersByOrder = []; // 엑셀 순서대로 저장

		// 현재 최대 시퀀스 번호 가져오기
		const lastUser = await User.findOne().sort({ sequence: -1 }).select('sequence');
		let currentSequence = lastUser ? lastUser.sequence : 0;

		for (let i = 0; i < users.length; i++) {
			const userData = users[i];
			// 행 처리 시작

			// 행별 처리 로그
			excelLogger.debug(`처리 중 [행 ${i + 1}]`, { row: i + 1, data: userData });

			// name 변수를 try 블록 밖에서 선언
			let name = '';

			try {
				// 엑셀 헤더 매핑 - 가능한 모든 헤더 형식 확인
				// 값이 undefined, null, 빈 문자열인 경우 모두 처리
				// __EMPTY 형식의 키도 처리
				const getValue = (obj, keys) => {
					for (const key of keys) {
						const value = obj[key];
						if (value !== undefined && value !== null && value !== '') {
							return String(value).trim();
						}
					}
					return '';
				};

				// __EMPTY 형식으로 파싱된 경우 처리
				// 첫 번째 행이 헤더인 경우 건너뛰기
				if (userData['용 역 자 관 리 명 부'] === '순번' || userData['__EMPTY_1'] === '성명') {
					// 헤더 행 건너뛰기
					continue;
				}

				// __EMPTY 형식의 필드 매핑
				// __EMPTY: 날짜, __EMPTY_1: 성명, __EMPTY_2: 연락처, __EMPTY_3: 주민번호
				// __EMPTY_4: 은행, __EMPTY_5: 계좌번호, __EMPTY_6: 판매인
				// __EMPTY_7: 판매인연락처, __EMPTY_8: 설계사, __EMPTY_9: 설계사연락처
				// __EMPTY_10: 보험상품명, __EMPTY_11: 보험회사

				// 날짜 필드 읽기 및 처리
				const dateValue = getValue(userData, ['날짜', 'date', '__EMPTY']);
				let createdAt;
				if (dateValue) {
					// Excel 날짜 처리 (숫자 또는 문자열)
					if (!isNaN(dateValue)) {
						// Excel 날짜 숫자 형식인 경우
						const excelDate = parseInt(dateValue);
						createdAt = new Date((excelDate - 25569) * 86400 * 1000);
					} else {
						// 문자열 날짜인 경우 (예: '2025-07-01', '2025/07/01', '20250701')
						createdAt = new Date(dateValue);
					}

					// 날짜가 유효하지 않으면 오늘 날짜 사용
					if (isNaN(createdAt.getTime())) {
						createdAt = new Date();
						excelLogger.debug(`행 ${i + 1}: 날짜 형식 오류, 오늘 날짜로 설정`);
					}
				} else {
					// 날짜 필드가 없으면 오늘 날짜 사용
					createdAt = new Date();
				}

				name = getValue(userData, ['성명', '이름', 'name', '__EMPTY_1']);
				const phone = getValue(userData, ['연락처', '전화번호', 'phone', '__EMPTY_2']);
				const idNumber = getValue(userData, ['주민번호', '__EMPTY_3']);
				const bank = getValue(userData, ['은행', 'bank', '__EMPTY_4']);
				const accountNumber = getValue(userData, ['계좌번호', '계좌', 'accountNumber', '__EMPTY_5']);
				const salesperson = getValue(userData, ['판매인', '추천인', 'salesperson', '__EMPTY_6']);
				const salespersonPhone = getValue(userData, ['판매인 연락처', '연락처.1', 'salespersonPhone', '__EMPTY_7']);
				const planner = getValue(userData, ['설계사', 'planner', '__EMPTY_8']);
				const plannerPhone = getValue(userData, ['설계사 연락처', '연락처.2', 'plannerPhone', '__EMPTY_9']);
				const insuranceProduct = getValue(userData, ['보험상품명', '보험상품', 'insuranceProduct', '__EMPTY_10']);
				const insuranceCompany = getValue(userData, ['보험회사', 'insuranceCompany', '__EMPTY_11']);
				const branch = getValue(userData, ['지사', '소속/지사', 'branch', '__EMPTY_12']);

				// 데이터 추출 완료

				if (!name) {
					results.failed++;
					results.errors.push(`행 ${i + 1}: 이름이 없습니다.`);
					excelLogger.warn(`행 ${i + 1} 실패: 이름 없음`);
					continue;
				}

				// 전화번호에서 암호 생성
				const phoneDigits = phone.replace(/[^0-9]/g, '');
				const password = phoneDigits.length >= 4 ? phoneDigits.slice(-4) : '1234';

				// loginId 자동 생성
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

				// 1단계에서는 부모 관계 설정하지 않음 (나중에 2단계에서 처리)

				// 비밀번호 해싱
				const passwordHash = await bcrypt.hash(password, 10);

				// 초기 등급 설정 (기본 F1, 부모가 있고 좌우가 채워지면 F2로 업그레이드)
				const grade = 'F1';

				// 시퀀스 번호 할당 (순서대로 증가)
				currentSequence++;

				// 사용자 생성 (부모 관계 없이)
				const newUser = new User({
					name,
					loginId,
					passwordHash,
					phone,
					idNumber,  // 주민번호 추가
					branch,
					bank,
					accountNumber,
					grade,
					salesperson,  // 판매인 정보만 저장 (관계는 나중에)
					salespersonPhone,  // 판매인 연락처 추가
					planner,  // planner 필드명 사용
					plannerPhone,  // plannerPhone 필드명 사용
					insuranceProduct,  // insuranceProduct 필드명 사용
					insuranceCompany,
					status: 'active',
					type: 'user',
					sequence: currentSequence,  // 시퀀스 번호 저장
					createdAt: createdAt  // 엑셀에서 읽은 날짜 또는 오늘 날짜
				});

				const savedUser = await newUser.save();
				registeredUsers.set(loginId, { user: savedUser, salesperson, name, row: i + 1 });
				usersByOrder.push({ loginId, salesperson, name, row: i + 1 }); // 순서대로 저장

				results.created++;
				// 사용자 등록 성공
					excelLogger.info('사용자 등록 성공', {
					row: i + 1,
					name,
					loginId,
					grade
				});

			} catch (error) {
				results.failed++;

				// 사용자 친화적인 오류 메시지
				let userFriendlyMsg = `행 ${i + 1}: `;

				// Cast to ObjectId 오류 처리
				if (error.message.includes('Cast to ObjectId')) {
					userFriendlyMsg += `데이터 형식 오류 (${name || '이름 없음'})`;
				}
				// 중복 키 오류
				else if (error.code === 11000 || error.message.includes('duplicate')) {
					userFriendlyMsg += `이미 등록된 사용자 (${name || '이름 없음'})`;
				}
				// Validation 오류
				else if (error.name === 'ValidationError') {
					userFriendlyMsg += `필수 항목 누락 (${name || '이름 없음'})`;
				}
				// 기타 오류
				else {
					userFriendlyMsg += `등록 실패 (${name || '이름 없음'})`;
				}

				results.errors.push(userFriendlyMsg);

				// 개발자용 상세 로그는 서버 로그에만 기록
				excelLogger.error('사용자 등록 실패', {
					row: i + 1,
					name: name || 'unknown',
					error: error.message,
					stack: error.stack
				});
			}
		}

		// 2단계: MLM 규칙 검증 및 부모-자식 관계 설정

		// 먼저 루트 노드 검증: "-" 판매인은 하나만 허용
		const rootCandidates = Array.from(registeredUsers.values()).filter(info =>
			info.salesperson === '-' || info.salesperson === '' || !info.salesperson
		);

		excelLogger.info(`🌱 루트 후보자: ${rootCandidates.length}명`, {
			candidates: rootCandidates.map(r => `${r.name}(판매인:${r.salesperson})`)
		});

		// 기존 루트 노드 확인 (방금 등록한 사용자들 제외)
		const registeredUserIds = Array.from(registeredUsers.values()).map(info => info.user._id);
		const existingRoot = await User.findOne({
			parentId: null,
			type: 'user',
			_id: { $nin: registeredUserIds }  // 방금 등록한 사용자들 제외
		});

		if (existingRoot) {
			excelLogger.info(`🌳 기존 루트 발견: ${existingRoot.name}`);
		} else {
			excelLogger.info(`🌱 기존 루트 없음`);
		}

		if (rootCandidates.length > 1) {
			results.failed += rootCandidates.length - 1;
			results.errors.push(`❌ 루트 노드는 하나만 허용됩니다. 판매인이 "-"인 사람은 ${rootCandidates.length}명입니다.`);
			excelLogger.error('다중 루트 노드 시도', { count: rootCandidates.length });
			return json({
				success: false,
				error: '루트 노드는 하나만 허용됩니다. 판매인이 "-"인 사람은 한 명만 가능합니다.'
			}, { status: 400 });
		}

		if (rootCandidates.length === 1 && existingRoot) {
			results.failed++;
			results.errors.push(`❌ 루트 노드가 이미 존재합니다: ${existingRoot.name}`);
			excelLogger.error('루트 노드 중복', { existing: existingRoot.name, new: rootCandidates[0].name });
			return json({
				success: false,
				error: `루트 노드가 이미 존재합니다: ${existingRoot.name}`
			}, { status: 400 });
		}

		// 부모-자식 관계 설정 (엑셀 순서대로)
		const failedUsers = [];

		for (const orderInfo of usersByOrder) {
			const loginId = orderInfo.loginId;
			const info = registeredUsers.get(loginId);

			// 루트 노드 처리 (판매인이 "-" 또는 빈값)
			if (info.salesperson === '-' || info.salesperson === '' || !info.salesperson) {
				// 루트는 부모 없이 그대로 둠 (parentId: null)
				excelLogger.info(`🌳 루트 노드 설정: ${info.name}, 판매인: ${info.salesperson}`);
				continue;
			}

			// 자기 자신을 판매인으로 등록하는 것 방지
			if (info.salesperson === info.name) {
				failedUsers.push(info.name);
				results.errors.push(`❌ ${info.name}: 자기 자신을 판매인으로 등록할 수 없습니다.`);
				excelLogger.warn(`자기 참조 방지: ${info.name}`);
				continue;
			}

			try {
				// 판매인 찾기 (DB 또는 방금 등록한 사용자 중에서)
				let parentUser = null;

				// 먼저 DB에서 찾기
				excelLogger.info(`🔍 ${info.name}: 판매인 '${info.salesperson}' 검색 시작`);
				parentUser = await User.findOne({
					$or: [
						{ name: info.salesperson },
						{ loginId: info.salesperson.toLowerCase() }
					],
					type: 'user'  // 용역자만
				});

				if (parentUser) {
					excelLogger.info(`✅ ${info.name}: DB에서 판매인 발견 - ${parentUser.name} (${parentUser.loginId})`);
				} else {
					excelLogger.info(`❌ ${info.name}: DB에서 판매인 '${info.salesperson}' 없음`);
				}

				// DB에 없으면 방금 등록한 사용자들 중에서 찾기
				if (!parentUser) {
					excelLogger.info(`🔍 ${info.name}: 방금 등록한 사용자들 중에서 '${info.salesperson}' 검색`);
					for (const [regLoginId, regInfo] of registeredUsers) {
						if (regInfo.name === info.salesperson) {
							parentUser = regInfo.user;
							excelLogger.info(`✅ ${info.name}: 방금 등록된 사용자에서 발견 - ${regInfo.name}`);
							break;
						}
					}
					if (!parentUser) {
						excelLogger.info(`❌ ${info.name}: 방금 등록된 사용자들에서도 '${info.salesperson}' 없음`);
					}
				}

				// 부모를 찾을 수 없으면 등록 실패
				if (!parentUser) {
					failedUsers.push(info.name);
					results.errors.push(`❌ ${info.name}: 판매인 '${info.salesperson}'을(를) 찾을 수 없습니다.`);
					excelLogger.error(`부모 없음: ${info.name} -> ${info.salesperson}`);
					continue;
				}

				const parentLoginId = parentUser.loginId;

				// 자식 노드 확인
				const leftChild = await User.findOne({
					parentId: parentLoginId,
					position: 'L'
				});
				const rightChild = await User.findOne({
					parentId: parentLoginId,
					position: 'R'
				});

				let position = null;
				if (!leftChild) {
					position = 'L';
				} else if (!rightChild) {
					position = 'R';
				}

				if (position) {
					// 사용자 업데이트: 부모 및 위치 설정
					excelLogger.info(`🔗 ${info.name}: 부모 관계 설정 시작 - 부모: ${parentLoginId}, 위치: ${position}`);

					const userUpdateResult = await User.findOneAndUpdate(
						{ loginId },
						{ parentId: parentLoginId, position }
					);
					excelLogger.info(`📝 ${info.name}: 사용자 parentId 업데이트 완료 - ${userUpdateResult ? '성공' : '실패'}`);

					// 부모 업데이트: 자식 참조 설정
					const updateField = position === 'L' ? 'leftChildId' : 'rightChildId';
					const parentUpdateResult = await User.findOneAndUpdate(
						{ loginId: parentLoginId },
						{ [updateField]: loginId }
					);
					excelLogger.info(`📝 ${info.name}: 부모 ${updateField} 업데이트 완료 - ${parentUpdateResult ? '성공' : '실패'}`);

					// 부모의 등급 업데이트
					await updateParentGrade(parentLoginId);
					excelLogger.info(`🎯 관계 설정 완료: ${info.name} -> ${info.salesperson} (${position})`);
				} else {
					// 좌우 자리가 모두 찬 경우
					failedUsers.push(info.name);
					const alertMsg = `${info.salesperson}님의 좌우 자리가 모두 찼습니다. ${info.name}님은 수동으로 배치해 주세요.`;
					if (!results.alerts) results.alerts = [];
					results.alerts.push({
						type: 'warning',
						message: alertMsg,
						parent: info.salesperson,
						user: info.name
					});
					results.errors.push(`⚠️ ${alertMsg}`);
					excelLogger.warn(`자리 부족: ${info.name} -> ${info.salesperson}`);
				}
			} catch (err) {
				failedUsers.push(info.name);
				results.errors.push(`❌ ${info.name}: 관계 설정 오류 - ${err.message}`);
				excelLogger.error(`관계 설정 오류 (${info.name}):`, err.message);
			}
		}

		// 부모 관계 설정에 실패한 사용자들 삭제
		if (failedUsers.length > 0) {
			for (const userName of failedUsers) {
				const userInfo = Array.from(registeredUsers.values()).find(info => info.name === userName);
				if (userInfo) {
					await User.findByIdAndDelete(userInfo.user._id);
					results.created--;
					results.failed++;
					excelLogger.warn(`사용자 삭제: ${userName} (부모 관계 설정 실패)`);
				}
			}
		}

		// 엑셀 업로드 결과 로그

		// 결과 로그 기록
		excelLogger.info('=== 엑셀 업로드 완료 ===', {
			admin: locals.user.name || locals.user.id,
			timestamp: new Date().toISOString(),
			success: results.created,
			failed: results.failed,
			errors: results.errors
		});

		// 배치 처리: 등급, 매출, 지급 스케줄 모두 자동 처리
		if (results.created > 0) {
			excelLogger.info('배치 처리 시작');
			try {
				// 등록된 사용자들을 월별로 그룹화
				const usersByMonth = new Map();

				for (const info of registeredUsers.values()) {
					const user = info.user;
					const year = user.createdAt.getFullYear();
					const month = user.createdAt.getMonth() + 1;
					const monthKey = `${year}-${String(month).padStart(2, '0')}`;

					if (!usersByMonth.has(monthKey)) {
						usersByMonth.set(monthKey, []);
					}
					usersByMonth.get(monthKey).push(user);
				}

				excelLogger.info('월별 사용자 분포:', Array.from(usersByMonth.keys()).map(m => `${m}: ${usersByMonth.get(m).length}명`).join(', '));

				// 월별로 매출 계산 및 지급 계획 생성
				const { calculateMonthlyRevenueForMonth } = await import('$lib/server/services/revenueService.js');

				for (const [monthKey, users] of usersByMonth) {
					const [year, month] = monthKey.split('-').map(Number);
					excelLogger.info(`${monthKey} 매출 계산 중...`);

					// 해당 월의 매출 계산
					await calculateMonthlyRevenueForMonth(year, month);
				}

				// 등록된 사용자 ID 수집
				const userIds = Array.from(registeredUsers.values()).map(info => info.user._id);

				// BatchProcessor로 등급 재계산
				const { batchProcessor } = await import('$lib/server/services/batchProcessor.js');
				const batchResult = await batchProcessor.processNewUsers(userIds);

				excelLogger.info('배치 처리 완료:', {
					processingTime: `${batchResult.processingTime}ms`,
					revenue: batchResult.results.revenue?.totalRevenue?.toLocaleString() + '원',
					schedules: batchResult.results.schedules?.length + '개',
					plans: batchResult.results.plans?.length + '명'
				});

				// 결과에 배치 처리 정보 추가
				results.batchProcessing = batchResult.results;
			} catch (err) {
				excelLogger.error('배치 처리 실패:', err);
				results.batchError = err.message;
			}
		}

		return json({
			success: true,
			created: results.created,
			failed: results.failed,
			errors: results.errors,
			alerts: results.alerts,  // 알림 추가
			message: `${results.created}명 등록 완료, ${results.failed}명 실패`
		});

	} catch (error) {
		excelLogger.error('Bulk user registration error:', error);
		return json({ error: '일괄 등록 중 오류가 발생했습니다.' }, { status: 500 });
	}
}

/**
 * GET: 엑셀 템플릿 다운로드
 */
export async function GET({ locals }) {
	// 관리자 권한 확인
	if (!locals.user || !locals.user.isAdmin) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	// xlsx 라이브러리 import
	const XLSX = await import('xlsx');

	// 샘플 데이터
	const sampleData = [
		['성명', '연락처', '지사', '은행', '계좌번호', '판매인', '설계사', '설계사 연락처', '보험상품명', '보험회사'],
		['홍길동', '010-1234-5678', '서울지사', '국민은행', '123-456-789', '', '', '', '', ''],
		['김철수', '010-2345-6789', '경기지사', '신한은행', '987-654-321', '홍길동', '이영희', '010-1111-2222', '종신보험', 'A생명'],
		['이영희', '010-3456-7890', '인천지사', '우리은행', '456-789-123', '홍길동', '박민수', '010-3333-4444', '연금보험', 'B생명'],
	];

	// 워크북 생성
	const workbook = XLSX.utils.book_new();
	const worksheet = XLSX.utils.aoa_to_sheet(sampleData);

	// 컬럼 너비 설정
	worksheet['!cols'] = [
		{ wch: 10 }, // 성명
		{ wch: 15 }, // 연락처
		{ wch: 12 }, // 지사
		{ wch: 12 }, // 은행
		{ wch: 20 }, // 계좌번호
		{ wch: 10 }, // 판매인
		{ wch: 10 }, // 설계사
		{ wch: 15 }, // 설계사 연락처
		{ wch: 15 }, // 보험상품명
		{ wch: 12 }, // 보험회사
	];

	XLSX.utils.book_append_sheet(workbook, worksheet, '사용자등록');

	// 바이너리로 변환
	const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

	return new Response(buffer, {
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': 'attachment; filename="user_registration_template.xlsx"'
		}
	});
}