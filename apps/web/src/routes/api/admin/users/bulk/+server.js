import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import User from '$lib/server/models/User.js';
import bcrypt from 'bcryptjs';
import { recalculateAllGrades, updateParentGrade } from '$lib/server/services/gradeCalculation.js';
import { excelLogger } from '$lib/server/logger.js';
import { smartTreeRestructure } from '$lib/server/services/treeRestructure.js';
import RevenueRecalculation from '$lib/server/services/revenueRecalculation.js';
import ValidationService from '$lib/server/services/validationService.js';

// 트리 구조 요약 생성 함수
function generateTreeSummary(structure) {
	const levelCounts = {};
	let maxLevel = 0;

	structure.forEach(node => {
		if (node.level !== undefined) {
			levelCounts[node.level] = (levelCounts[node.level] || 0) + 1;
			maxLevel = Math.max(maxLevel, node.level);
		}
	});

	return {
		totalDepth: maxLevel + 1,
		levelDistribution: levelCounts,
		totalNodes: structure.length
	};
}

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

		// ===== 사전 검증 단계: 전체 엑셀 데이터 검증 =====
		excelLogger.info('=== 사전 검증 시작 ===');
		
		const parsedUsers = []; // 파싱된 사용자 데이터
		const excelUserNames = new Set(); // 엑셀 내 모든 사용자 이름
		let rootCount = 0; // 최상위 루트 개수

		// 1차 패스: 엑셀 내 모든 사용자 이름 수집
		for (let i = 0; i < users.length; i++) {
			const userData = users[i];

			const getValue = (obj, keys) => {
				for (const key of keys) {
					const value = obj[key];
					if (value !== undefined && value !== null && value !== '') {
						return String(value).trim();
					}
				}
				return '';
			};

			// 헤더 행 건너뛰기
			if (userData['용 역 자 관 리 명 부'] === '순번' || userData['__EMPTY_1'] === '성명') {
				continue;
			}

			const name = getValue(userData, ['성명', '이름', 'name', '__EMPTY_1']);
			if (!name) {
				continue; // 빈 행 건너뛰기
			}

			excelUserNames.add(name);
		}

		// 2차 패스: 판매인 검증
		for (let i = 0; i < users.length; i++) {
			const userData = users[i];

			const getValue = (obj, keys) => {
				for (const key of keys) {
					const value = obj[key];
					if (value !== undefined && value !== null && value !== '') {
						return String(value).trim();
					}
				}
				return '';
			};

			// 헤더 행 건너뛰기
			if (userData['용 역 자 관 리 명 부'] === '순번' || userData['__EMPTY_1'] === '성명') {
				continue;
			}

			const name = getValue(userData, ['성명', '이름', 'name', '__EMPTY_1']);
			if (!name) {
				continue; // 빈 행 건너뛰기
			}

			const salesperson = getValue(userData, ['판매인', '추천인', 'salesperson', '__EMPTY_6']);
			
			// 판매인 검증
			if (!salesperson || salesperson === '-') {
				// 최상위 루트
				rootCount++;
				if (rootCount > 1) {
					const error = `엑셀 업로드 실패: 최상위 루트(판매인 없음)는 1명만 가능합니다. 행 ${i + 1} (${name})에서 2번째 루트 발견.`;
					excelLogger.error(error);
					return json({ 
						error,
						details: '판매인이 없거나 "-"인 사용자는 계층의 최상위 루트가 되며, 1명만 허용됩니다.'
					}, { status: 400 });
				}
			} else {
				// 판매인이 있는 경우
				// 1) 같은 엑셀 파일 내에 있는지 확인 (순차 등록 허용)
				const isInExcel = excelUserNames.has(salesperson);
				
				// 2) 이미 DB에 등록된 사용자인지 확인
				const existingSeller = await User.findOne({
					$or: [
						{ name: salesperson },
						{ loginId: salesperson }
					]
				});

				// 엑셀에도 없고 DB에도 없으면 에러
				if (!isInExcel && !existingSeller) {
					const error = `엑셀 업로드 실패: 행 ${i + 1} (${name})의 판매인 "${salesperson}"이(가) 시스템에 등록되어 있지 않으며, 엑셀 파일에도 없습니다.`;
					excelLogger.error(error);
					return json({ 
						error,
						details: '판매인은 이미 시스템에 등록된 용역자이거나, 같은 엑셀 파일 내에서 앞쪽에 위치한 사용자여야 합니다.'
					}, { status: 400 });
				}

				// 엑셀 내에 있는 경우, 순서 확인 (판매인이 현재 사용자보다 앞에 있어야 함)
				if (isInExcel) {
					let sellerRowIndex = -1;
					let currentRowIndex = -1;

					for (let j = 0; j < users.length; j++) {
						const checkUserData = users[j];
						const checkName = getValue(checkUserData, ['성명', '이름', 'name', '__EMPTY_1']);
						
						if (checkName === salesperson) {
							sellerRowIndex = j;
						}
						if (checkName === name) {
							currentRowIndex = j;
							break;
						}
					}

					if (sellerRowIndex >= currentRowIndex) {
						const error = `엑셀 업로드 실패: 행 ${i + 1} (${name})의 판매인 "${salesperson}"이(가) 현재 행보다 뒤에 위치하거나 같은 행에 있습니다.`;
						excelLogger.error(error);
						return json({ 
							error,
							details: '판매인은 엑셀 파일에서 현재 사용자보다 앞쪽에 위치해야 합니다.'
						}, { status: 400 });
					}
				}
			}

			parsedUsers.push({ userData, row: i + 1 });
		}

		excelLogger.info('=== 사전 검증 완료 ===', { 
			totalRows: parsedUsers.length,
			rootCount,
			excelUsers: excelUserNames.size
		})

		// ===== 1단계: 모든 사용자를 먼저 등록 (부모 관계 설정 없이) =====
		const registeredUsers = new Map(); // loginId -> user 매핑
		const usersByOrder = []; // 엑셀 순서대로 저장

		// 현재 최대 시퀀스 번호 가져오기
		const lastUser = await User.findOne().sort({ sequence: -1 }).select('sequence');
		let currentSequence = lastUser ? lastUser.sequence : 0;

		for (let i = 0; i < parsedUsers.length; i++) {
			const { userData, row } = parsedUsers[i];
			// 행 처리 시작
			// 행별 처리 로그
			excelLogger.debug(`처리 중 [행 ${row}]`, { row, data: userData });

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
						excelLogger.debug(`행 ${row}: 날짜 형식 오류, 오늘 날짜로 설정`);
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
					results.errors.push(`행 ${row}: 이름이 없습니다.`);
					excelLogger.warn(`행 ${row} 실패: 이름 없음`);
					continue;
				}

				// ValidationService로 등록 전 검증
				const validation = await ValidationService.validateRegistration({
					name,
					phone,
					bank,
					accountNumber,
					salesperson
				});

				if (!validation.isValid) {
					results.failed++;
					const errorMessages = validation.errors.map(e => `${e.field}: ${e.message}`).join(', ');
					results.errors.push(`행 ${row} (${name}): ${errorMessages}`);
					excelLogger.warn(`행 ${row} 검증 실패: ${errorMessages}`);
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

				// 사용자 생성 (부모 관계 없이) - 새로운 스키마 필드 추가
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
					gradePaymentCount: 0,  // 등급별 지급 횟수
					lastGradeChangeDate: new Date(),  // 마지막 등급 변경일
					consecutiveGradeWeeks: 0,  // 연속 등급 유지 주차
					insuranceActive: false,  // 보험 유지 여부
					insuranceAmount: 0,  // 보험료
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
				registeredUsers.set(loginId, { user: savedUser, salesperson, name, row });
				usersByOrder.push({ loginId, salesperson, name, row }); // 순서대로 저장

				results.created++;
				// 사용자 등록 성공
				excelLogger.info('사용자 등록 성공', {
					row,
					name,
					loginId,
					grade
				});

			} catch (error) {
				results.failed++;

				// 사용자 친화적인 오류 메시지
				let userFriendlyMsg = `행 ${row}: `;

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
					row,
					name: name || 'unknown',
					error: error.message,
					stack: error.stack
				});
			}
		}

		// 2단계: 스마트 트리 재구성 (판매인 관계를 고려한 자동 배치)
		excelLogger.info('=== 스마트 트리 재구성 시작 ===');

		// 등록된 모든 사용자 수집
		const allRegisteredUsers = Array.from(registeredUsers.values()).map(info => info.user);

		try {
			// 스마트 트리 재구성 실행
			const treeResults = await smartTreeRestructure(allRegisteredUsers, {
				preserveSalesRelations: true,  // 판매인 관계 최대한 유지
				autoPlaceUnmatched: true       // 매칭 안 되는 사용자도 자동 배치
			});

			excelLogger.info('🌳 트리 재구성 결과:', {
				successful: treeResults.successful,
				failed: treeResults.failed,
				warnings: treeResults.warnings?.length || 0
			});

			// 경고 메시지 처리
			if (treeResults.warnings && treeResults.warnings.length > 0) {
				if (!results.alerts) results.alerts = [];
				treeResults.warnings.forEach(warning => {
					results.alerts.push({
						type: 'info',
						message: warning
					});
				});
			}

			// 실패한 배치 처리
			if (treeResults.failed > 0) {
				results.failed += treeResults.failed;
				treeResults.errors.forEach(error => {
					results.errors.push(`⚠️ 자동 배치 실패: ${error}`);
				});
			}

			// 트리 구조 요약 생성
			const structureSummary = generateTreeSummary(treeResults.structure);
			excelLogger.info('📊 트리 구조 요약:', structureSummary);

			// 결과에 트리 구조 정보 추가
			results.treeStructure = {
				totalNodes: treeResults.structure.length,
				directPlacements: treeResults.structure.filter(s => s.relationship === 'direct').length,
				indirectPlacements: treeResults.structure.filter(s => s.relationship === 'indirect').length,
				autoPlaced: treeResults.structure.filter(s => s.note === '자동 배치 (판매인 관계 없음)').length
			};

		} catch (treeError) {
			excelLogger.error('트리 재구성 오류:', treeError);
			results.errors.push('❌ 트리 자동 재구성 중 오류 발생');
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

				// 등록된 사용자 ID 수집
				const userIds = Array.from(registeredUsers.values()).map(info => info.user._id);

				// BatchProcessor로 등급 재계산 및 지급 계획 생성
				// (등급 재계산 후 정확한 등급으로 지급 계획 생성)
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

				// 과거 날짜 데이터가 포함된 경우 놓친 지급 처리
				excelLogger.info('놓친 지급 확인 및 처리 중...');
				try {
					// 과거 날짜 사용자가 있는지 확인
					const now = new Date();
					const hasPastData = Array.from(registeredUsers.values()).some(info => {
						const userDate = info.user.createdAt;
						return userDate < now && (
							userDate.getFullYear() < now.getFullYear() ||
							(userDate.getFullYear() === now.getFullYear() && userDate.getMonth() < now.getMonth())
						);
					});

					if (hasPastData) {
						excelLogger.info('과거 날짜 데이터 감지 - 매출 재계산 및 놓친 지급 처리');
						const recalcResult = await RevenueRecalculation.processAfterBulkUpload();

						if (recalcResult.success) {
							excelLogger.info('매출 재계산 완료:', recalcResult.results);
							results.revenueRecalculation = recalcResult.results;
						} else {
							excelLogger.warn('매출 재계산 실패:', recalcResult.error);
						}
					}
				} catch (recalcError) {
					excelLogger.error('놓친 지급 처리 오류:', recalcError);
				}
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