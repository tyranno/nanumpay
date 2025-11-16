/**
 * 금액 계산 유틸리티 v7.0
 *
 * 역할: 등급별 지급액 계산 순수 함수
 *
 * 누적 방식 계산:
 * - F1: F1 풀 금액만
 * - F2: F1 금액 + F2 풀 금액
 * - F3: F2 금액 + F3 풀 금액
 * - ...
 */

/**
 * 등급별 배분율
 */
const GRADE_RATES = {
	F1: 0.24, // 24%
	F2: 0.19, // 19%
	F3: 0.14, // 14%
	F4: 0.09, // 9%
	F5: 0.05, // 5%
	F6: 0.03, // 3%
	F7: 0.02, // 2%
	F8: 0.01 // 1%
};

/**
 * 등급별 지급액 계산 (누적 방식)
 *
 * @param {number} totalRevenue - 총 매출액
 * @param {Object} gradeDistribution - 등급별 인원 분포 { F1: 2, F2: 1, ... }
 * @returns {Object} 등급별 지급액 { F1: 240000, F2: 810000, ... }
 */
export function calculateGradePayments(totalRevenue, gradeDistribution) {
	const payments = {};
	let previousAmount = 0;

	const grades = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'];

	for (let i = 0; i < grades.length; i++) {
		const grade = grades[i];
		const nextGrade = grades[i + 1];

		const currentCount = gradeDistribution[grade] || 0;
		const nextCount = gradeDistribution[nextGrade] || 0;

		if (currentCount > 0) {
			// 현재 등급 풀 금액 = 총 매출 × 배분율
			const poolAmount = totalRevenue * GRADE_RATES[grade];

			// 풀 대상자 = 현재 등급 + 다음 등급
			const poolCount = currentCount + nextCount;

			if (poolCount > 0) {
				// 1인당 추가 금액 = 풀 금액 / 풀 대상자
				const additionalPerPerson = poolAmount / poolCount;

				// 누적 금액 = 이전 등급 금액 + 추가 금액
				payments[grade] = previousAmount + additionalPerPerson;
				previousAmount = additionalPerPerson;
			} else {
				payments[grade] = previousAmount;
			}
		} else {
			payments[grade] = 0;
		}
	}

	return payments;
}

/**
 * 지급액 검증 (100원 단위 반올림)
 *
 * @param {number} amount - 원본 금액
 * @returns {number} 100원 단위로 반올림된 금액
 */
export function roundToHundred(amount) {
	return Math.round(amount / 100) * 100;
}

/**
 * 10회 분할 금액 계산
 *
 * @param {number} totalAmount - 총 지급액
 * @returns {number} 10회 분할 금액 (100원 단위)
 */
export function calculateInstallmentAmount(totalAmount) {
	const installmentAmount = totalAmount / 10;
	return roundToHundred(installmentAmount);
}

/**
 * 등급별 지급액 디버그 출력
 *
 * @param {number} totalRevenue - 총 매출액
 * @param {Object} gradeDistribution - 등급별 인원 분포
 * @param {Object} gradePayments - 등급별 지급액
 */
export function debugGradePayments(totalRevenue, gradeDistribution, gradePayments) {
	console.log('\n💰 등급별 지급액 계산 상세:');
	console.log(`  총 매출: ${totalRevenue.toLocaleString()}원`);
	console.log(`  등급 분포: ${JSON.stringify(gradeDistribution)}`);
	console.log('\n  등급별 지급액:');

	const grades = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'];

	for (const grade of grades) {
		const count = gradeDistribution[grade] || 0;
		const payment = gradePayments[grade] || 0;

		if (count > 0) {
			console.log(`    ${grade}: ${payment.toLocaleString()}원 (${count}명)`);
			console.log(`      10회 분할: ${calculateInstallmentAmount(payment).toLocaleString()}원/회`);
		}
	}

	console.log('');
}
