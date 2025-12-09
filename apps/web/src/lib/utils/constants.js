/**
 * 클라이언트용 시스템 상수
 * ⭐ v8.0 보험 조건
 */

export const GRADE_LIMITS = {
	F1: {
		maxInstallments: 20,
		insuranceRequired: false
	},
	F2: {
		maxInstallments: 30,
		insuranceRequired: false
	},
	F3: {
		maxInstallments: 30,  // 40 → 30 변경
		insuranceRequired: false
	},
	F4: {
		maxInstallments: 40,
		insuranceRequired: true,
		insuranceAmount: 70000
	},
	F5: {
		maxInstallments: 40,  // 50 → 40 변경
		insuranceRequired: true,
		insuranceAmount: 70000
	},
	F6: {
		maxInstallments: 50,
		insuranceRequired: true,
		insuranceAmount: 90000
	},
	F7: {
		maxInstallments: 50,  // 60 → 50 변경
		insuranceRequired: true,
		insuranceAmount: 90000
	},
	F8: {
		maxInstallments: 50,  // 60 → 50 변경
		insuranceRequired: true,
		insuranceAmount: 110000
	}
};

/**
 * 등급별 필요 보험금액 텍스트
 */
export function getInsuranceRequirementText(grade) {
	const limit = GRADE_LIMITS[grade];
	if (!limit?.insuranceRequired) {
		return '보험 불필요';
	}
	return `${(limit.insuranceAmount || 0).toLocaleString()}원 이상`;
}
