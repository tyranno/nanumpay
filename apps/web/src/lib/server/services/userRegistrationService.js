import User from '../models/User.js';
import UserAccount from '../models/UserAccount.js'; // v8.0
import PlannerAccount from '../models/PlannerAccount.js'; // v8.0
import bcrypt from 'bcryptjs';
import { smartTreeRestructure } from './treeRestructure.js';
import ValidationService from './validationService.js';
import { processUserRegistration } from './registrationService.js';

/**
 * 사용자 등록 공통 서비스
 * - bulk (일괄 등록)와 register (개별 등록) 공통 로직
 * - register는 1명짜리 bulk로 처리
 *
 * ⚠️ 동시성 문제 해결: 각 요청마다 새 인스턴스 생성 (stateful)
 */
export class UserRegistrationService {
	constructor() {
		this.registeredUsers = new Map(); // loginId -> user info 매핑
		this.excelUserNames = new Set(); // 엑셀 내 모든 사용자 이름
	}

	/**
	 * 메인 등록 함수
	 * @param {Array} users - 등록할 사용자 배열 (1명 이상)
	 * @param {Object} options - { source: 'bulk' | 'register', admin: 사용자 }
	 */
	async registerUsers(users, options = {}) {
		const { source = 'bulk', admin } = options;

		const results = {
			created: 0,
			failed: 0,
			errors: [],
			alerts: [],
			users: [] // ⭐ 등록된 사용자 반환 (캡슐화)
		};

		try {
			// 1단계: 사전 검증
			const validation = await this.validateUsers(users);
			if (!validation.isValid) {
				console.error('검증 실패:', validation.error);
				throw new Error(validation.error);
			}

			// 2단계: 사용자 생성
			const createResults = await this.createUsers(users);
			results.created = createResults.created;
			results.failed = createResults.failed;
			results.errors = createResults.errors;

			// 3단계: 트리 재구성
			const treeResults = await this.restructureTree();
			if (treeResults.warnings && treeResults.warnings.length > 0) {
				treeResults.warnings.forEach((warning) => {
					results.alerts.push({
						type: 'info',
						message: warning
					});
				});
			}
			if (treeResults.failed > 0) {
				results.failed += treeResults.failed;
				treeResults.errors?.forEach((error) => {
					results.errors.push(`⚠️ 자동 배치 실패: ${error}`);
				});
			}
			results.treeStructure = {
				totalNodes: treeResults.structure?.length || 0,
				directPlacements:
					treeResults.structure?.filter((s) => s.relationship === 'direct').length || 0,
				indirectPlacements:
					treeResults.structure?.filter((s) => s.relationship === 'indirect').length || 0,
				autoPlaced:
					treeResults.structure?.filter((s) => s.note === '자동 배치 (판매인 관계 없음)').length ||
					0
			};

			// 4단계: 배치 처리 (등급, 매출, 지급계획)
			if (results.created > 0) {
				const batchResult = await this.processBatch();
				results.batchProcessing = batchResult;
			}

			// ⭐ 등록된 사용자 정보 반환 (내부 상태 직접 노출하지 않음)
			results.users = Array.from(this.registeredUsers.values()).map((info) => info.user);

			return results;
		} catch (error) {
			console.error('사용자 등록 오류:', error);
			throw error;
		}
	}

	/**
	 * 1단계: 사전 검증
	 * - 판매인 검증
	 * - 최상위 루트 1개 제한
	 * - 순서 검증 (엑셀 내)
	 */
	async validateUsers(users) {
		const parsedUsers = [];
		this.excelUserNames.clear();
		let rootCount = 0;

		// 헬퍼 함수: 엑셀 셀 값 읽기
		const getValue = (obj, keys) => {
			for (const key of keys) {
				const value = obj[key];
				if (value !== undefined && value !== null && value !== '') {
					return String(value).trim();
				}
			}
			return '';
		};

		// 1차 패스: 모든 사용자 이름 수집
		for (let i = 0; i < users.length; i++) {
			const userData = users[i];

			// v8.0: 헤더 행 건너뛰기 (ID 컬럼 추가로 인한 변경)
			if (userData['용 역 자 관 리 명 부'] === '순번' || userData['__EMPTY_2'] === '성명') {
				continue;
			}

			const name = getValue(userData, ['성명', '이름', 'name', '__EMPTY_2']);
			if (!name) continue; // 빈 행 건너뛰기

			this.excelUserNames.add(name);
		}

		// 2차 패스: 판매인 검증
		for (let i = 0; i < users.length; i++) {
			const userData = users[i];

			// v8.0: 헤더 행 건너뛰기 (ID 컬럼 추가로 인한 변경)
			if (userData['용 역 자 관 리 명 부'] === '순번' || userData['__EMPTY_2'] === '성명') {
				continue;
			}

			const name = getValue(userData, ['성명', '이름', 'name', '__EMPTY_2']);
			if (!name) continue;

			const salesperson = getValue(userData, ['판매인', '추천인', 'salesperson', '__EMPTY_7']);

			// 판매인 검증
			if (!salesperson || salesperson === '-') {
				// 최상위 루트
				rootCount++;
				if (rootCount > 1) {
					return {
						isValid: false,
						error: `엑셀 업로드 실패: 최상위 루트(판매인 없음)는 1명만 가능합니다. 행 ${i + 1} (${name})에서 2번째 루트 발견.`,
						details: '판매인이 없거나 "-"인 사용자는 계층의 최상위 루트가 되며, 1명만 허용됩니다.'
					};
				}
			} else {
				// 판매인이 있는 경우
				// 1) 같은 엑셀 파일 내에 있는지 확인
				const isInExcel = this.excelUserNames.has(salesperson);

				// 2) 이미 DB에 등록된 사용자인지 확인
				const existingSeller = await User.findOne({
					$or: [{ name: salesperson }, { loginId: salesperson }]
				});

				// 엑셀에도 없고 DB에도 없으면 에러
				if (!isInExcel && !existingSeller) {
					return {
						isValid: false,
						error: `엑셀 업로드 실패: 행 ${i + 1} (${name})의 판매인 "${salesperson}"이(가) 시스템에 등록되어 있지 않으며, 엑셀 파일에도 없습니다.`,
						details:
							'판매인은 이미 시스템에 등록된 용역자이거나, 같은 엑셀 파일 내에서 앞쪽에 위치한 사용자여야 합니다.'
					};
				}

				// 엑셀 내에 있는 경우, 순서 확인 (판매인이 현재 사용자보다 앞에 있어야 함)
				if (isInExcel) {
					let sellerRowIndex = -1;
					let currentRowIndex = -1;

					for (let j = 0; j < users.length; j++) {
						const checkUserData = users[j];
						const checkName = getValue(checkUserData, ['성명', '이름', 'name', '__EMPTY_2']); // v8.0

						if (checkName === salesperson) {
							sellerRowIndex = j;
						}
						if (checkName === name) {
							currentRowIndex = j;
							break;
						}
					}

					if (sellerRowIndex >= currentRowIndex) {
						return {
							isValid: false,
							error: `엑셀 업로드 실패: 행 ${i + 1} (${name})의 판매인 "${salesperson}"이(가) 현재 행보다 뒤에 위치하거나 같은 행에 있습니다.`,
							details: '판매인은 엑셀 파일에서 현재 사용자보다 앞쪽에 위치해야 합니다.'
						};
					}
				}
			}

			parsedUsers.push({ userData, row: i + 1 });
		}

		return {
			isValid: true,
			parsedUsers,
			rootCount
		};
	}

	/**
	 * 2단계: 사용자 생성
	 * - loginId 자동 생성
	 * - sequence 할당
	 * - User.save()
	 */
	async createUsers(users) {
		const results = {
			created: 0,
			failed: 0,
			errors: []
		};

		this.registeredUsers.clear();
		const usersByOrder = [];

		// 현재 최대 시퀀스 번호 가져오기
		const lastUser = await User.findOne().sort({ sequence: -1 }).select('sequence');
		let currentSequence = lastUser ? lastUser.sequence : 0;

		// 헬퍼 함수: 엑셀 셀 값 읽기
		const getValue = (obj, keys) => {
			for (const key of keys) {
				const value = obj[key];
				if (value !== undefined && value !== null && value !== '') {
					return String(value).trim();
				}
			}
			return '';
		};

		for (let i = 0; i < users.length; i++) {
			const userData = users[i];
			const row = i + 1;
			let name = '';
			let loginId = '';

			try {
				// v8.0: 헤더 행 건너뛰기 (ID 컬럼 추가로 인한 변경)
				if (userData['용 역 자 관 리 명 부'] === '순번' || userData['__EMPTY_2'] === '성명') {
					continue;
				}

				// 날짜 필드 처리
				const dateValue = getValue(userData, ['날짜', 'date', '__EMPTY', 'registrationDate']);
				let createdAt;
				if (dateValue) {
					// Excel 날짜 처리
					if (!isNaN(dateValue)) {
						const excelDate = parseInt(dateValue);
						createdAt = new Date((excelDate - 25569) * 86400 * 1000);
					} else {
						createdAt = new Date(dateValue);
					}

					// 날짜가 유효하지 않으면 오늘 날짜
					if (isNaN(createdAt.getTime())) {
						createdAt = new Date();
					}
				} else {
					createdAt = new Date();
				}

				// v8.0: 필드 추출 (ID 컬럼 추가)
				loginId = getValue(userData, ['ID', 'id', '__EMPTY_1']);
				name = getValue(userData, ['성명', '이름', 'name', '__EMPTY_2']);
				const phone = getValue(userData, ['연락처', '전화번호', 'phone', '__EMPTY_3']);
				const idNumber = getValue(userData, ['주민번호', '__EMPTY_4']);
				const bank = getValue(userData, ['은행', 'bank', '__EMPTY_5']);
				const accountNumber = getValue(userData, [
					'계좌번호',
					'계좌',
					'accountNumber',
					'__EMPTY_6'
				]);
				const salesperson = getValue(userData, ['판매인', '추천인', 'salesperson', '__EMPTY_7']);
				const salespersonPhone = getValue(userData, [
					'판매인 연락처',
					'연락처.1',
					'salespersonPhone',
					'__EMPTY_8'
				]);
				const plannerName = getValue(userData, ['설계사', 'planner', '__EMPTY_9']);
				const plannerPhone = getValue(userData, [
					'설계사 연락처',
					'연락처.2',
					'plannerPhone',
					'__EMPTY_10'
				]);
				const insuranceProduct = getValue(userData, [
					'보험상품명',
					'보험상품',
					'insuranceProduct',
					'__EMPTY_11'
				]);
				const insuranceCompany = getValue(userData, ['보험회사', 'insuranceCompany', '__EMPTY_12']);
				const branch = getValue(userData, ['지사', '소속/지사', 'branch', '__EMPTY_13']);

				// v8.0: 필수 필드 검증
				if (!loginId) {
					results.failed++;
					results.errors.push(`행 ${row}: ID가 없습니다.`);
					console.warn(`행 ${row} 실패: ID 없음`);
					continue;
				}

				if (!name) {
					results.failed++;
					results.errors.push(`행 ${row}: 이름이 없습니다.`);
					console.warn(`행 ${row} 실패: 이름 없음`);
					continue;
				}

				// v8.0: 설계사 필수 검증
				if (!plannerName) {
					results.failed++;
					results.errors.push(`행 ${row} (${name}): 설계사가 비어있습니다.`);
					console.warn(`행 ${row} 실패: 설계사 없음`);
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
					const errorMessages = validation.errors.map((e) => `${e.field}: ${e.message}`).join(', ');
					results.errors.push(`행 ${row} (${name}): ${errorMessages}`);
					console.warn(`행 ${row} 검증 실패: ${errorMessages}`);
					continue;
				}

				// v8.0: UserAccount 생성 또는 조회
				let userAccount = await UserAccount.findOne({ loginId: loginId.toLowerCase() });

				if (!userAccount) {
					// 신규: UserAccount 생성
					const phoneDigits = phone.replace(/[^0-9]/g, '');
					const password = phoneDigits.length >= 4 ? phoneDigits.slice(-4) : '1234';
					const passwordHash = await bcrypt.hash(password, 10);

					userAccount = new UserAccount({
						loginId: loginId.toLowerCase(),
						passwordHash,
						name,
						phone,
						idNumber,
						bank,
						accountNumber,
						email: getValue(userData, ['email', 'Email', '__EMPTY_14']) || null,
						status: 'active',
						createdAt: createdAt
					});
					await userAccount.save();
					console.log(`✅ UserAccount 생성: ${loginId}`);
				} else {
					// 재등록: 개인정보 업데이트 안 함 (v8.0 설계 원칙)
					console.log(`✅ UserAccount 재사용: ${loginId} (registrationNumber will be incremented)`);
				}

				// v8.0: PlannerAccount 생성 또는 조회 (자동 생성)
				let plannerAccount = await PlannerAccount.findOne({ loginId: plannerName });

				if (!plannerAccount) {
					const plannerPhoneDigits = plannerPhone.replace(/[^0-9]/g, '');
					const plannerPassword = plannerPhoneDigits.length >= 4 ? plannerPhoneDigits.slice(-4) : '1234';
					const plannerPasswordHash = await bcrypt.hash(plannerPassword, 10);

					plannerAccount = new PlannerAccount({
						loginId: plannerName,
						passwordHash: plannerPasswordHash,
						name: plannerName,
						phone: plannerPhone,
						status: 'active',
						createdAt: createdAt
					});
					await plannerAccount.save();
					console.log(`✅ PlannerAccount 자동 생성: ${plannerName} (초기 비밀번호: ${plannerPassword})`);
				}

				// v8.0: registrationNumber 계산
				const existingUsers = await User.find({ userAccountId: userAccount._id })
					.sort({ registrationNumber: -1 })
					.limit(1);

				const registrationNumber = existingUsers.length > 0
					? existingUsers[0].registrationNumber + 1
					: 1;

				// v8.0: 표시 이름 생성 (홍길동, 홍길동2, 홍길동3)
				const displayName = registrationNumber === 1 ? name : `${name}${registrationNumber}`;

				// 초기 등급 설정
				const grade = 'F1';

				// 시퀀스 번호 할당
				currentSequence++;

				// v8.0: User 생성 (FK 연결)
				const newUser = new User({
					userAccountId: userAccount._id, // FK
					registrationNumber, // 1, 2, 3...
					plannerAccountId: plannerAccount._id, // FK (required)
					name: displayName, // 홍길동, 홍길동2, 홍길동3
					branch,
					grade,
					gradePaymentCount: 0,
					lastGradeChangeDate: createdAt,
					consecutiveGradeWeeks: 0,
					insuranceActive: false,
					insuranceAmount: 0,
					salesperson,
					salespersonPhone,
					insuranceProduct,
					insuranceCompany,
					status: 'active',
					type: 'user',
					sequence: currentSequence,
					createdAt: createdAt
				});

				const savedUser = await newUser.save();
				// v8.0: registeredUsers는 User._id 기준 (내부 트리 처리용)
				this.registeredUsers.set(savedUser._id.toString(), { user: savedUser, salesperson, name: displayName, row });
				usersByOrder.push({ userId: savedUser._id.toString(), salesperson, name: displayName, row });

				results.created++;
			} catch (error) {
				results.failed++;

				let userFriendlyMsg = `행 ${row}: `;

				if (error.message.includes('Cast to ObjectId')) {
					userFriendlyMsg += `데이터 형식 오류 (${name || '이름 없음'})`;
				} else if (error.code === 11000 || error.message.includes('duplicate')) {
					userFriendlyMsg += `이미 등록된 사용자 (${name || '이름 없음'})`;
				} else if (error.name === 'ValidationError') {
					userFriendlyMsg += `필수 항목 누락 (${name || '이름 없음'})`;
				} else {
					userFriendlyMsg += `등록 실패 (${name || '이름 없음'})`;
				}

				results.errors.push(userFriendlyMsg);

				console.error('사용자 등록 실패', {
					row,
					name: name || 'unknown',
					error: error.message,
					stack: error.stack
				});
			}
		}

		return results;
	}

	/**
	 * 3단계: 트리 재구성
	 * - smartTreeRestructure 호출
	 */
	async restructureTree() {
		const allRegisteredUsers = Array.from(this.registeredUsers.values()).map((info) => info.user);

		if (allRegisteredUsers.length === 0) {
			console.warn('등록된 사용자가 없어 트리 재구성을 건너뜁니다.');
			return {
				successful: 0,
				failed: 0,
				structure: [],
				warnings: [],
				errors: []
			};
		}

		try {
			const treeResults = await smartTreeRestructure(allRegisteredUsers, {
				preserveSalesRelations: true,
				autoPlaceUnmatched: true
			});

			return treeResults;
		} catch (treeError) {
			console.error('트리 재구성 오류:', treeError);
			return {
				successful: 0,
				failed: allRegisteredUsers.length,
				structure: [],
				warnings: [],
				errors: [treeError.message]
			};
		}
	}

	/**
	 * 4단계: 배치 처리
	 * - 등급 재계산, 매출 계산, 지급 계획 생성
	 * - ⭐ v7.0: 월별로 순차 처리하여 매출 계산 정확도 보장
	 */
	async processBatch() {
		try {
			// 등록된 사용자들을 월별로 그룹화
			const usersByMonth = new Map();

			for (const info of this.registeredUsers.values()) {
				const user = info.user;
				const year = user.createdAt.getFullYear();
				const month = user.createdAt.getMonth() + 1;
				const monthKey = `${year}-${String(month).padStart(2, '0')}`;

				if (!usersByMonth.has(monthKey)) {
					usersByMonth.set(monthKey, []);
				}
				usersByMonth.get(monthKey).push(user);
			}

			// 월별 키를 시간순으로 정렬 (2025-07, 2025-08, 2025-09 ...)
			const sortedMonths = Array.from(usersByMonth.keys()).sort();

			// ⭐ 각 월별로 순차 처리
			const allResults = {
				revenue: { totalRevenue: 0, byMonth: {} },
				schedules: [],
				plans: []
			};

			for (const monthKey of sortedMonths) {
				const users = usersByMonth.get(monthKey);
				const userIds = users.map((u) => u._id);

				// registrationService로 등급 재계산 및 지급 계획 생성
				const monthResult = await processUserRegistration(userIds);

				// 결과 병합
				allResults.revenue.totalRevenue += monthResult.revenue?.totalRevenue || 0;
				allResults.revenue.byMonth[monthKey] = monthResult.revenue;
				if (monthResult.schedules) {
					allResults.schedules.push(...monthResult.schedules);
				}
				if (monthResult.plans) {
					allResults.plans.push(...monthResult.plans);
				}
			}

			return allResults;
		} catch (err) {
			console.error('배치 처리 실패:', err);
			throw err;
		}
	}
}

/**
 * ⭐ 사용자 등록 함수 (싱글톤 대신 함수 방식)
 * - 동시성 문제 해결: 매 호출마다 새 인스턴스 생성
 * - 캡슐화 보장: 결과로 사용자 정보 반환
 *
 * @param {Array} users - 등록할 사용자 배열
 * @param {Object} options - { source: 'bulk'|'register', admin }
 * @returns {Promise<Object>} results - { created, failed, errors, alerts, users, ... }
 */
export async function registerUsers(users, options = {}) {
	const service = new UserRegistrationService();
	return await service.registerUsers(users, options);
}
