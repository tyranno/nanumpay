/**
 * 용역비 지급명부 공용 유틸리티 함수
 */

import { GRADE_LIMITS } from '$lib/server/utils/constants.js';

/**
 * ⭐ v8.0: 보험 조건 체크 - F4+ 보험 미가입 시 금액 0으로 처리
 * @param {string} grade - 등급 (F1~F8)
 * @param {number} userInsuranceAmount - 사용자 보험 금액
 * @param {number} amount - 원래 금액
 * @returns {number} - 보험 조건 충족 시 원래 금액, 미충족 시 0
 */
export function applyInsuranceCondition(grade, userInsuranceAmount, amount) {
	const gradeLimit = GRADE_LIMITS[grade];

	if (gradeLimit?.insuranceRequired) {
		const requiredInsurance = gradeLimit.insuranceAmount || 0;
		const userInsurance = userInsuranceAmount || 0;

		if (userInsurance < requiredInsurance) {
			return 0;  // 보험 미가입 시 금액 0
		}
	}

	return amount;
}

/**
 * ⭐ v8.0: 보험 조건 체크 여부 확인
 * @param {string} grade - 등급 (F1~F8)
 * @param {number} userInsuranceAmount - 사용자 보험 금액
 * @returns {boolean} - 보험 조건 미충족으로 skip 여부
 */
export function shouldSkipByInsurance(grade, userInsuranceAmount) {
	const gradeLimit = GRADE_LIMITS[grade];

	if (gradeLimit?.insuranceRequired) {
		const requiredInsurance = gradeLimit.insuranceAmount || 0;
		const userInsurance = userInsuranceAmount || 0;

		return userInsurance < requiredInsurance;
	}

	return false;
}

/**
 * 검색 필터 구성
 */
export function buildSearchFilter(search, searchCategory) {
	const filter = {};

	if (search) {
		if (searchCategory === 'name') {
			filter.userName = { $regex: search, $options: 'i' };
		} else if (searchCategory === 'planner') {
			filter.needPlannerSearch = true;
			filter.plannerSearch = search;
		} else if (searchCategory === 'grade') {
			// 등급 검색: baseGrade로 필터링
			filter.baseGrade = search; // "F1", "F2", ...
		}
	}

	return filter;
}

/**
 * gradeInfo 생성: 등급(회수) 형식 - 기본지급회차/추가지급회차
 * @param {Array} payments - 지급 계획 배열
 * @returns {string} - "F1(1,2), F2(6/1,7/2)" 형식
 */
export function generateGradeInfo(payments) {
	if (!payments || payments.length === 0) {
		return '-';
	}

	// 등급별로 그룹화하여 기본/추가 지급 회차 매칭
	const gradeMap = {}; // { 'F2': { basic: [1,2,3], additional: [1,2,3] } }

	payments.forEach(p => {
		const grade = p.baseGrade;
		const stage = p.추가지급단계 || 0;

		if (!gradeMap[grade]) {
			gradeMap[grade] = { basic: [], additional: [] };
		}

		if (stage === 0) {
			gradeMap[grade].basic.push(p.week);
		} else {
			gradeMap[grade].additional.push(p.week);
		}
	});

	// 형식화: 기본만/추가만: F2(1,2,3,4), 둘 다: F2(6/1,7/2,8/3,9/4)
	return Object.entries(gradeMap).map(([grade, data]) => {
		const hasBasic = data.basic.length > 0;
		const hasAdditional = data.additional.length > 0;

		if (hasBasic && hasAdditional) {
			// 둘 다 있을 때: 슬래시로 구분
			const pairs = [];
			const maxLen = Math.max(data.basic.length, data.additional.length);
			for (let i = 0; i < maxLen; i++) {
				const basic = data.basic[i] || '';
				const additional = data.additional[i] || '';
				pairs.push(`${basic}/${additional}`);
			}
			return `${grade}(${pairs.join(',')})`;
		} else if (hasBasic) {
			// 기본지급만: 슬래시 없이
			return `${grade}(${data.basic.join(',')})`;
		} else {
			// 추가지급만: 슬래시 없이
			return `${grade}(${data.additional.join(',')})`;
		}
	}).join(', ');
}

/**
 * 선택된 기간의 최고 등급 계산
 * @param {Array} payments - 지급 계획 배열
 * @param {string} defaultGrade - 기본 등급
 * @returns {string} - "F1" ~ "F8"
 */
export function calculatePeriodGrade(payments, defaultGrade = 'F1') {
	const gradeOrder = { F1: 1, F2: 2, F3: 3, F4: 4, F5: 5, F6: 6, F7: 7, F8: 8 };

	if (!payments || payments.length === 0) {
		return defaultGrade;
	}

	return payments.reduce((maxGrade, p) => {
		const currentGrade = p.baseGrade || 'F1';
		return (gradeOrder[currentGrade] || 0) > (gradeOrder[maxGrade] || 0)
			? currentGrade
			: maxGrade;
	}, 'F1');
}

/**
 * Aggregation Pipeline에서 최대 등급을 계산하는 단계
 * @returns {Array} - $addFields 단계 배열
 */
export function getMaxGradePipelineStages() {
	return [
		{
			$addFields: {
				// 등급을 숫자로 변환하여 최대값 계산
				maxGradeNum: {
					$max: {
						$map: {
							input: '$grades',
							as: 'g',
							in: { $toInt: { $substr: ['$$g', 1, -1] } }
						}
					}
				}
			}
		},
		{
			$addFields: {
				// 최대 등급을 다시 문자열로 변환
				maxGrade: { $concat: ['F', { $toString: '$maxGradeNum' }] }
			}
		}
	];
}
