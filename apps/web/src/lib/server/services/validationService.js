/**
 * 검증 서비스
 * 용역자 등록 시 비즈니스 규칙 검증
 */

import User from '../models/User.js';
import logger from '../logger.js';

// 필드명 한글 매핑
const FIELD_LABELS = {
	salesperson: '판매인',
	name: '성명',
	phone: '연락처',
	idNumber: '주민번호',
	bank: '은행',
	accountNumber: '계좌번호',
	branch: '지사',
	agent: '설계사',
	agentPhone: '설계사 연락처',
	insuranceProduct: '보험상품명',
	insuranceCompany: '보험회사',
	system: '시스템'
};

class ValidationService {
	/**
	 * 용역자 등록 전 검증
	 * @param {Object} userData - 등록할 용역자 데이터
	 * @returns {Object} { isValid, errors }
	 */
	static async validateRegistration(userData) {
		const errors = [];

		try {
			// 1. 자기 자신을 판매인으로 등록 방지
			if (userData.salesperson === userData.name) {
				errors.push({
					field: 'salesperson',
					message: '자기 자신을 판매인으로 등록할 수 없습니다'
				});
			}

			// 2. 루트 노드 단일성 보장
			if (!userData.salesperson || userData.salesperson === '-' || userData.salesperson === '') {
				const rootExists = await User.findOne({
					parentId: null,
					type: 'user'
				});

				if (rootExists) {
					errors.push({
						field: 'salesperson',
						message: `루트 노드는 이미 존재합니다 (${rootExists.name})`
					});
				}
			}

			// 3. 판매인의 좌우 자리 확인
			if (userData.salesperson && userData.salesperson !== '-') {
				// 판매인 찾기 (이름으로 검색)
				const sponsor = await User.findOne({
					name: userData.salesperson,
					type: 'user'
				});

				if (sponsor) {
					// 좌우 자리 모두 차있는지 확인 (cascade 삭제로 필드가 항상 정확)
					if (sponsor.leftChildId && sponsor.rightChildId) {
						errors.push({
							field: 'salesperson',
							message: `${sponsor.name}님의 좌우 자리가 모두 차있어 추가할 수 없습니다`
						});
					}
				} else if (userData.salesperson !== '-') {
					// 판매인을 찾을 수 없는 경우 (나중에 처리될 수 있음)
					logger.warn(`판매인 '${userData.salesperson}'을(를) 찾을 수 없습니다. 일괄 처리 중일 수 있습니다.`);
				}
			}

			// 4. 필수 필드 검증
			const requiredFields = ['name', 'phone', 'bank', 'accountNumber'];
			for (const field of requiredFields) {
				if (!userData[field]) {
					errors.push({
						field,
						message: `${field}은(는) 필수 항목입니다`
					});
				}
			}

			// 5. 전화번호 형식 검증
			if (userData.phone && !this.isValidPhoneNumber(userData.phone)) {
				errors.push({
					field: 'phone',
					message: '올바른 전화번호 형식이 아닙니다'
				});
			}

			// 6. 계좌번호 형식 검증
			if (userData.accountNumber && !this.isValidAccountNumber(userData.accountNumber)) {
				errors.push({
					field: 'accountNumber',
					message: '올바른 계좌번호 형식이 아닙니다'
				});
			}

		} catch (error) {
			logger.error('검증 중 오류:', error);
			errors.push({
				field: 'system',
				message: '검증 중 시스템 오류가 발생했습니다'
			});
		}

		return {
			isValid: errors.length === 0,
			errors
		};
	}

	/**
	 * 전화번호 형식 검증
	 */
	static isValidPhoneNumber(phone) {
		// 010-1234-5678 또는 01012345678 형식
		const phoneRegex = /^(010|011|016|017|018|019)[-]?\d{3,4}[-]?\d{4}$/;
		return phoneRegex.test(phone);
	}

	/**
	 * 계좌번호 형식 검증
	 */
	static isValidAccountNumber(accountNumber) {
		// 숫자와 하이픈만 허용, 최소 10자리
		const accountRegex = /^[\d-]{10,}$/;
		return accountRegex.test(accountNumber);
	}

	/**
	 * 등급 변경 가능 여부 검증
	 */
	static canChangeGrade(currentGrade, newGrade) {
		const grades = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'];
		const currentIndex = grades.indexOf(currentGrade);
		const newIndex = grades.indexOf(newGrade);

		// 등급은 상승만 가능 (하락 불가)
		return newIndex > currentIndex;
	}

	/**
	 * 보험 조건 충족 여부 검증
	 */
	static async validateInsuranceRequirement(userId, grade) {
		// F1, F2는 보험 조건 없음
		if (['F1', 'F2'].includes(grade)) {
			return { isValid: true };
		}

		const user = await User.findById(userId);
		if (!user) {
			return {
				isValid: false,
				message: '사용자를 찾을 수 없습니다'
			};
		}

		// SystemConfig에서 최소 보험 금액 가져오기
		const SystemConfig = (await import('../models/SystemConfig.js')).default;
		const config = await SystemConfig.getCurrent();
		const minAmount = config.minInsuranceAmounts[grade];

		if (!user.insuranceActive || user.insuranceAmount < minAmount) {
			return {
				isValid: false,
				message: `${grade} 등급은 최소 ${minAmount.toLocaleString()}원의 보험 유지가 필요합니다`
			};
		}

		return { isValid: true };
	}

	/**
	 * 지급 가능 여부 검증 (최대 회수 체크)
	 */
	static async validatePaymentEligibility(userId, grade) {
		const user = await User.findById(userId);
		if (!user) {
			return {
				isValid: false,
				message: '사용자를 찾을 수 없습니다'
			};
		}

		// SystemConfig에서 최대 지급 회수 가져오기
		const SystemConfig = (await import('../models/SystemConfig.js')).default;
		const config = await SystemConfig.getCurrent();
		const maxCount = config.maxPaymentCounts[grade];

		if (user.gradePaymentCount >= maxCount) {
			return {
				isValid: false,
				message: `${grade} 등급의 최대 지급 회수(${maxCount}회)에 도달했습니다`
			};
		}

		// 보험 조건도 함께 체크
		const insuranceCheck = await this.validateInsuranceRequirement(userId, grade);
		if (!insuranceCheck.isValid) {
			return insuranceCheck;
		}

		return { isValid: true };
	}

	/**
	 * 필드명을 한글로 변환
	 * @param {string} fieldName - 영문 필드명
	 * @returns {string} 한글 필드명
	 */
	static getFieldLabel(fieldName) {
		return FIELD_LABELS[fieldName] || fieldName;
	}
}

export default ValidationService;