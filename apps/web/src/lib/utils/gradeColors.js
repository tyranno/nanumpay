/**
 * MLM 등급별 색상 및 스타일 유틸리티
 * F1 (최하위) → F8 (최상위)
 */

// 등급별 색상 정의 (낮은 등급에서 높은 등급으로 점진적 변화)
export const gradeColors = {
	F1: {
		bg: 'bg-gray-100',
		text: 'text-gray-600',
		border: 'border-gray-300',
		label: '신입',
		level: 1,
		description: '기본 등급'
	},
	F2: {
		bg: 'bg-amber-100',
		text: 'text-amber-700',
		border: 'border-amber-300',
		label: '일반',
		level: 2,
		description: '양쪽 자식 보유'
	},
	F3: {
		bg: 'bg-yellow-100',
		text: 'text-yellow-700',
		border: 'border-yellow-300',
		label: '브론즈',
		level: 3,
		description: 'F2 2명 (좌1, 우1)'
	},
	F4: {
		bg: 'bg-lime-100',
		text: 'text-lime-700',
		border: 'border-lime-300',
		label: '실버',
		level: 4,
		description: 'F3 2명 (좌1, 우1)'
	},
	F5: {
		bg: 'bg-emerald-100',
		text: 'text-emerald-700',
		border: 'border-emerald-300',
		label: '골드',
		level: 5,
		description: 'F4 2명 이상'
	},
	F6: {
		bg: 'bg-blue-100',
		text: 'text-blue-700',
		border: 'border-blue-300',
		label: '플래티넘',
		level: 6,
		description: 'F5 2명 이상'
	},
	F7: {
		bg: 'bg-purple-100',
		text: 'text-purple-700',
		border: 'border-purple-300',
		label: '다이아몬드',
		level: 7,
		description: 'F6 2명 이상'
	},
	F8: {
		bg: 'bg-gradient-to-r from-purple-100 via-pink-100 to-indigo-100',
		text: 'text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-indigo-600',
		border: 'border-gradient-to-r from-purple-400 to-indigo-400',
		label: '마스터',
		level: 8,
		description: 'F7 2명 이상 (최고 등급)',
		special: true
	}
};

/**
 * 등급에 따른 배지 클래스 반환
 * @param {string} grade - F1~F8
 * @param {string} size - 'sm', 'md', 'lg'
 * @returns {string} Tailwind CSS 클래스
 */
export function getGradeBadgeClass(grade, size = 'md') {
	const gradeInfo = gradeColors[grade] || gradeColors.F1;

	let sizeClass = '';
	switch (size) {
		case 'sm':
			sizeClass = 'px-2 py-0.5 text-xs';
			break;
		case 'lg':
			sizeClass = 'px-4 py-2 text-base';
			break;
		default:
			sizeClass = 'px-3 py-1 text-sm';
	}

	// F8은 특별한 스타일 적용
	if (grade === 'F8') {
		return `${sizeClass} font-bold rounded-full ${gradeInfo.bg} ${gradeInfo.text} ring-2 ring-purple-400 ring-opacity-50 shadow-md`;
	}

	return `${sizeClass} font-semibold rounded-full ${gradeInfo.bg} ${gradeInfo.text}`;
}

/**
 * 등급 진행도 계산 (백분율)
 * @param {string} grade - F1~F8
 * @returns {number} 0-100
 */
export function getGradeProgress(grade) {
	const gradeInfo = gradeColors[grade] || gradeColors.F1;
	return ((gradeInfo.level - 1) / 7) * 100;
}

/**
 * 등급별 아이콘 반환
 * @param {string} grade - F1~F8
 * @returns {string} 아이콘 문자
 */
export function getGradeIcon(grade) {
	const icons = {
		F1: '🌱', // 새싹
		F2: '🌿', // 잎
		F3: '🥉', // 브론즈
		F4: '🥈', // 실버
		F5: '🥇', // 골드
		F6: '💎', // 다이아몬드
		F7: '👑', // 왕관
		F8: '🌟'  // 별 (최고 등급)
	};
	return icons[grade] || '🌱';
}

/**
 * 등급 정보 객체 반환
 * @param {string} grade - F1~F8
 * @returns {object} 등급 정보
 */
export function getGradeInfo(grade) {
	const info = gradeColors[grade] || gradeColors.F1;
	return {
		...info,
		icon: getGradeIcon(grade),
		progress: getGradeProgress(grade),
		badgeClass: getGradeBadgeClass(grade)
	};
}

/**
 * 다음 등급까지 필요한 조건 반환
 * @param {string} currentGrade - 현재 등급
 * @returns {object} 승급 조건
 */
export function getNextGradeRequirements(currentGrade) {
	const requirements = {
		F1: { next: 'F2', requirement: '왼쪽과 오른쪽에 각각 1명씩 구성원 필요' },
		F2: { next: 'F3', requirement: 'F2 등급 2명 필요 (왼쪽 1, 오른쪽 1)' },
		F3: { next: 'F4', requirement: 'F3 등급 2명 필요 (왼쪽 1, 오른쪽 1)' },
		F4: { next: 'F5', requirement: 'F4 등급 2명 이상 필요' },
		F5: { next: 'F6', requirement: 'F5 등급 2명 이상 필요' },
		F6: { next: 'F7', requirement: 'F6 등급 2명 이상 필요' },
		F7: { next: 'F8', requirement: 'F7 등급 2명 이상 필요' },
		F8: { next: null, requirement: '최고 등급 달성!' }
	};
	return requirements[currentGrade] || requirements.F1;
}

// 전체 등급 목록 (순서대로)
export const gradeList = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'];

// 등급별 수수료율 (예시)
export const gradeCommissionRates = {
	F1: 0.05,  // 5%
	F2: 0.07,  // 7%
	F3: 0.10,  // 10%
	F4: 0.12,  // 12%
	F5: 0.15,  // 15%
	F6: 0.17,  // 17%
	F7: 0.20,  // 20%
	F8: 0.25   // 25%
};