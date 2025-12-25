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
	 * 1단계: 사전 검증 (⭐ 전체 검증 - 하나라도 실패하면 전체 중단)
	 * - 필수 필드 검증
	 * - 이름 중복 검증 (DB 조회)
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

		// 1차 패스: 모든 사용자 이름 수집 + 필수 필드 검증
		const validUsers = [];
		for (let i = 0; i < users.length; i++) {
			const userData = users[i];

			// v8.0: 헤더 행 건너뛰기 (ID 컬럼 추가로 인한 변경)
			if (userData['용 역 자 관 리 명 부'] === '순번' || userData['__EMPTY_2'] === '성명') {
				continue;
			}

			// ⭐ v8.1: 고정 헤더명으로만 값 읽기 (빈값이면 빈값 그대로)
			const loginId = String(userData['ID'] ?? '').trim();
			const name = String(userData['성명'] ?? '').trim();
			const phone = String(userData['연락처'] ?? '').trim();
			const bank = String(userData['은행'] ?? '').trim();
			const accountNumber = String(userData['계좌번호'] ?? '').trim();
			const plannerName = String(userData['설계사'] ?? '').trim();
			const salesperson = String(userData['판매인'] ?? '').trim();

			if (!name) continue; // 빈 행 건너뛰기

			// ⭐ 필수 필드 검증
			if (!loginId) {
				return {
					isValid: false,
					error: `등록 실패: 행 ${i + 1} (${name})에 ID가 없습니다.`,
					details: 'ID는 필수 항목입니다.'
				};
			}

			if (!plannerName) {
				return {
					isValid: false,
					error: `등록 실패: 행 ${i + 1} (${name})에 설계사가 없습니다.`,
					details: '설계사는 필수 항목입니다.'
				};
			}

			// ⭐ ValidationService로 기본 검증 (연락처, 은행, 계좌번호 등)
			const validation = await ValidationService.validateRegistration({
				name,
				phone,
				bank,
				accountNumber,
				salesperson
			});

			if (!validation.isValid) {
				const errorMessages = validation.errors
					.map((e) => `${ValidationService.getFieldLabel(e.field)}: ${e.message}`)
					.join(', ');
				return {
					isValid: false,
					error: `등록 실패: 행 ${i + 1} (${name}) 검증 실패 - ${errorMessages}`,
					details: '모든 필수 항목을 올바르게 입력해주세요.'
				};
			}

			// ⭐ 이름 중복 체크 (DB 조회)
			const existingUserWithSameName = await User.findOne({ name: name });
			if (existingUserWithSameName) {
				// 개별 등록(1명)일 때는 행 번호 생략
				const errorMsg = users.length === 1
					? `등록 실패: 이미 등록된 이름 "${name}"이(가) 있습니다.`
					: `등록 실패: 행 ${i + 1}에서 이미 시스템에 등록된 이름 "${name}"이(가) 발견되었습니다.`;
				return {
					isValid: false,
					error: errorMsg,
					details: '같은 이름의 용역자가 이미 존재합니다. 성명을 변경해주세요 (예: 홍길동2, 홍길동3).'
				};
			}

			this.excelUserNames.add(name);
			validUsers.push({ userData, name, loginId, row: i + 1 });
		}

		// 2차 패스: 판매인 검증
		for (let i = 0; i < validUsers.length; i++) {
			const { userData, name, row } = validUsers[i];

			const salesperson = String(userData['판매인'] ?? '').trim();

			// 판매인 검증
			if (!salesperson || salesperson === '-') {
				// 최상위 루트
				rootCount++;
				if (rootCount > 1) {
					return {
						isValid: false,
						error: `등록 실패: 최상위 루트(판매인 없음)는 1명만 가능합니다. 행 ${row} (${name})에서 2번째 루트 발견.`,
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
						error: `등록 실패: 행 ${row} (${name})의 판매인 "${salesperson}"이(가) 시스템에 등록되어 있지 않으며, 엑셀 파일에도 없습니다.`,
						details:
							'판매인은 이미 시스템에 등록된 용역자이거나, 같은 엑셀 파일 내에서 앞쪽에 위치한 사용자여야 합니다.'
					};
				}

				// 엑셀 내에 있는 경우, 순서 확인 (판매인이 현재 사용자보다 앞에 있어야 함)
				if (isInExcel) {
					let sellerRowIndex = -1;
					let currentRowIndex = i;

					for (let j = 0; j < validUsers.length; j++) {
						if (validUsers[j].name === salesperson) {
							sellerRowIndex = j;
							break;
						}
					}

					if (sellerRowIndex >= currentRowIndex) {
						return {
							isValid: false,
							error: `등록 실패: 행 ${row} (${name})의 판매인 "${salesperson}"이(가) 현재 행보다 뒤에 위치하거나 같은 행에 있습니다.`,
							details: '판매인은 엑셀 파일에서 현재 사용자보다 앞쪽에 위치해야 합니다.'
						};
					}
				}
			}

			parsedUsers.push({ userData, row });
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
	 * - sequence 할당 (⭐ 날짜순 정렬 후 할당)
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

		// ⭐ 1단계: 모든 사용자 데이터 파싱 (날짜 포함)
		const parsedUsers = [];
		
		for (let i = 0; i < users.length; i++) {
			const userData = users[i];
			const row = i + 1;

			try {
				// v8.0: 헤더 행 건너뛰기 (ID 컬럼 추가로 인한 변경)
				if (userData['용 역 자 관 리 명 부'] === '순번' || userData['__EMPTY_2'] === '성명') {
					continue;
				}

				// 날짜 필드 처리 (순번 컬럼 있으면 __EMPTY_1, 없으면 __EMPTY)
				const dateValue = getValue(userData, ['날짜', 'date', '__EMPTY_1', '__EMPTY', 'registrationDate']);
				let createdAt;
				if (dateValue) {
					// Excel 날짜 처리 (숫자/문자열 혼용 지원)
					const numValue = Number(dateValue);
					const isExcelSerial = !isNaN(numValue) && numValue > 40000 && numValue < 60000;
					
					if (isExcelSerial) {
						// 순수 Excel 날짜 시리얼 (예: 45108)
						createdAt = new Date((numValue - 25569) * 86400 * 1000);
					} else {
						// 문자열 날짜 (예: "2024-07-01", "7/1/2024")
						createdAt = new Date(dateValue);
					}

					// 날짜가 유효하지 않으면 오늘 날짜
					if (isNaN(createdAt.getTime())) {
						createdAt = new Date();
					}
					
					// ⭐ 시간 부분 12:00:00 UTC로 통일 (타임존 무관하게 같은 날짜 보장)
					createdAt.setUTCHours(12, 0, 0, 0);
				} else {
					createdAt = new Date();
					createdAt.setUTCHours(12, 0, 0, 0);
				}

				// ⭐ v8.1: 고정 헤더명으로만 값 읽기 (빈값이면 빈값 그대로)
				// A:순번(0), B:날짜(1), C:ID(2), D:성명(3), E:연락처(4), F:주민번호(5), G:은행(6), H:비율(7), I:계좌번호(8)
				// J:판매인(9), K:연락처(10), L:설계사(11), M:연락처(12), N:설계사 은행(13), O:설계사 계좌번호(14)
				// P:보험금액유형(15), Q:보험회사(16), R:지사(17)
				const loginId = String(userData['ID'] ?? userData['__EMPTY_2'] ?? '').trim();
				const name = String(userData['성명'] ?? userData['__EMPTY_3'] ?? '').trim();
				const phone = String(userData['__EMPTY_4'] ?? userData['연락처'] ?? '').trim();  // E열(4): 본인 연락처
				const idNumber = String(userData['주민번호'] ?? userData['__EMPTY_5'] ?? '').trim();
				const bank = String(userData['은행'] ?? userData['__EMPTY_6'] ?? '').trim();  // G열(6)
				const ratioRaw = String(userData['비율'] ?? userData['__EMPTY_7'] ?? '').trim();  // H열(7)
				const ratio = parseFloat(ratioRaw) || 1;
				const accountNumber = String(userData['계좌번호'] ?? userData['__EMPTY_8'] ?? '').trim();  // I열(8)
				const salesperson = String(userData['판매인'] ?? userData['__EMPTY_9'] ?? '').trim();  // J열(9)
				const salespersonPhone = String(userData['__EMPTY_10'] ?? userData['연락처_1'] ?? '').trim();  // K열(10): 판매인 연락처
				const plannerName = String(userData['설계사'] ?? userData['__EMPTY_11'] ?? '').trim();  // L열(11)
				const plannerPhone = String(userData['__EMPTY_12'] ?? userData['연락처_2'] ?? '').trim();  // M열(12): 설계사 연락처
				const plannerBank = String(userData['설계사 은행'] ?? userData['__EMPTY_13'] ?? '').trim();  // N열(13)
				const plannerAccountNumber = String(userData['설계사 계좌번호'] ?? userData['__EMPTY_14'] ?? '').trim();  // O열(14)
				const insuranceProduct = String(userData['보험상품명'] ?? userData['보험금액유형'] ?? userData['__EMPTY_15'] ?? '').trim();  // P열(15)
				const insuranceCompany = String(userData['보험회사'] ?? userData['__EMPTY_16'] ?? '').trim();  // Q열(16)
				const branch = String(userData['지사'] ?? userData['__EMPTY_17'] ?? '').trim();  // R열(17)

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

				// ⭐ 파싱된 데이터 저장 (나중에 정렬용)
				parsedUsers.push({
					userData,
					row,
					createdAt,
					loginId,
					name,
					phone,
					idNumber,
					bank,
					ratio,
					accountNumber,
					salesperson,
					salespersonPhone,
					plannerName,
					plannerPhone,
					plannerAccountNumber,
					plannerBank,
					insuranceProduct,
					insuranceCompany,
					branch
				});

			} catch (error) {
				results.failed++;
				results.errors.push(`행 ${row}: 데이터 파싱 실패`);
				console.error(`행 ${row} 파싱 오류:`, error);
			}
		}

		// ⭐ 2단계: 날짜순 정렬 (같은 날짜면 원래 엑셀 행 순서 유지)
		parsedUsers.sort((a, b) => {
			const dateCompare = a.createdAt.getTime() - b.createdAt.getTime();
			if (dateCompare !== 0) return dateCompare;
			return a.row - b.row; // 같은 날짜면 엑셀 행 순서
		});

		console.log(`📋 등록 순서 정렬 완료: ${parsedUsers.length}명 (날짜순 → 엑셀행순)`);
		parsedUsers.forEach((p, idx) => {
			console.log(`  ${idx + 1}. ${p.name} - ${p.createdAt.toISOString().split('T')[0]} (엑셀행: ${p.row})`);
		});

		// ⭐ 3단계: 정렬된 순서대로 sequence 할당 및 저장
		for (const parsed of parsedUsers) {
			const {
				row,
				createdAt,
				loginId,
				name,
				phone,
				idNumber,
				bank,
				ratio,
				accountNumber,
				salesperson,
				salespersonPhone,
				plannerName,
				plannerPhone,
				plannerAccountNumber,
				plannerBank,
				insuranceProduct,
				insuranceCompany,
				branch
			} = parsed;

			try {
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
						email: null,
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
					// 엑셀의 설계사 전화번호 사용 (없으면 기본값)
					const plannerPhoneFinal = plannerPhone || '010-0000-0000';
					const plannerPhoneDigits = plannerPhoneFinal.replace(/[^0-9]/g, '');
					const plannerPassword = plannerPhoneDigits.length >= 4 ? plannerPhoneDigits.slice(-4) : '9999';
					const plannerPasswordHash = await bcrypt.hash(plannerPassword, 10);

					plannerAccount = new PlannerAccount({
						loginId: plannerName,
						passwordHash: plannerPasswordHash,
						name: plannerName,
						phone: plannerPhoneFinal,
					// ⭐ v8.0: 설계사 계좌 정보
					bank: plannerBank || '',
					accountNumber: plannerAccountNumber || '',
						status: 'active',
						createdAt: createdAt
					});
					await plannerAccount.save();
					console.log(`✅ PlannerAccount 자동 생성: ${plannerName} (초기 비밀번호: ${plannerPassword}, 전화번호: ${plannerPhoneFinal})`);
				}

				// v8.0: registrationNumber 계산 (같은 UserAccount의 재등록 순번)
				const existingUsers = await User.find({ userAccountId: userAccount._id })
					.sort({ registrationNumber: -1 })
					.limit(1);

				const registrationNumber = existingUsers.length > 0
					? existingUsers[0].registrationNumber + 1
					: 1;

				// 이름은 그대로 사용 (숫자 붙이지 않음)
				const displayName = name;

				// 초기 등급 설정
				const grade = 'F1';

				// ⭐ 시퀀스 번호 할당 (정렬된 순서대로)
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
					// ⭐ v8.0: lastGradeChangeDate 제거 (gradeHistory virtual로 제공)
					consecutiveGradeWeeks: 0,
					insuranceActive: false,
					insuranceAmount: 0,
					// ⭐ v8.0: 비율 (지급액 계산에 사용)
					ratio: ratio,
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
	 * - ⭐ v8.0 수정: 월별로 처리 (승급일은 하위 노드 등록일 기준으로 계산)
	 */
	async processBatch() {
		try {
			// ⭐ v8.0 수정: 월별로 그룹화 (지급 계획은 월 단위로 관리)
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

			// 월별 키를 시간순으로 정렬 (2025-10, 2025-11, ...)
			const sortedMonths = Array.from(usersByMonth.keys()).sort();
			console.log(`
📅 월별 배치 처리: ${sortedMonths.length}개월치 데이터`);
			sortedMonths.forEach(m => {
				console.log(`  → ${m}: ${usersByMonth.get(m).length}명`);
			});

			// ⭐ 각 월별로 순차 처리
			const allResults = {
				revenue: { totalRevenue: 0, byMonth: {} },
				schedules: [],
				plans: []
			};

			for (const monthKey of sortedMonths) {
				const users = usersByMonth.get(monthKey);
				const userIds = users.map((u) => u._id);

				console.log(`
🔄 [${monthKey}] 월별 배치 처리 시작: ${users.length}명`);

				// registrationService로 등급 재계산 및 지급 계획 생성
				const monthResult = await processUserRegistration(userIds);

				// 결과 병합
				allResults.revenue.totalRevenue += monthResult.revenue?.totalRevenue || 0;
				if (!allResults.revenue.byMonth[monthKey]) {
					allResults.revenue.byMonth[monthKey] = { totalRevenue: 0 };
				}
				allResults.revenue.byMonth[monthKey].totalRevenue += monthResult.revenue?.totalRevenue || 0;
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
