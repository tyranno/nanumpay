import { writable } from 'svelte/store';

/**
 * 관리자 대시보드 카드별 상태 관리 Store
 * 모바일 ↔ 웹 전환 시에도 선택사항 유지
 */

// ⭐ 날짜를 YYYY-MM-DD 형식으로 변환
function formatDate(date) {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// ⭐ 기본 기간: 오늘 ~ 3주 후 (UI 표시용, 검색은 해당 주 금요일까지 확장됨)
const todayDate = new Date();
todayDate.setHours(0, 0, 0, 0);
const threeWeeksLater = new Date(todayDate);
threeWeeksLater.setDate(todayDate.getDate() + 21);

const defaultStartWeekDate = formatDate(todayDate);
const defaultEndWeekDate = formatDate(threeWeeksLater);

// 매출 통계 카드 상태 (MonthlyRevenueCard + MonthlyRevenueCardMobile 공유)
export const revenueCardState = writable({
	viewMode: 'single', // 'single' (월간) | 'range' (기간)
	startYear: new Date().getFullYear(),
	startMonth: new Date().getMonth() + 1,
	endYear: new Date().getFullYear(),
	endMonth: new Date().getMonth() + 1
});

// 지급 통계 카드 상태 (PaymentStatisticsCard + PaymentStatisticsCardMobile 공유)
export const paymentCardState = writable({
	viewMode: 'weekly', // 'weekly' (주간) | 'monthly' (월간)
	startYear: new Date().getFullYear(),
	startMonth: new Date().getMonth() + 1,
	endYear: new Date().getFullYear(),
	endMonth: new Date().getMonth() + 1
});

// 용역비 관리대장 페이지 필터 상태 (PaymentPage 공유)
const today = new Date();
export const paymentPageFilterState = writable({
	filterType: 'date', // 'date' | 'period'
	selectedDate: today.toISOString().split('T')[0],
	selectedYear: today.getFullYear(),
	selectedMonth: today.getMonth() + 1,
	periodType: 'weekly', // 'weekly' | 'monthly'
	startYear: today.getFullYear(),
	startMonth: today.getMonth() + 1,
	endYear: today.getFullYear(),
	endMonth: today.getMonth() + 1,
	// ⭐ 주별 기간 선택용 (설계사/사용자용) - 기본: 이번주 ~ 4주 후
	startWeekDate: defaultStartWeekDate,
	endWeekDate: defaultEndWeekDate,
	itemsPerPage: 20,
	// 컬럼 표시 설정
	showGradeInfoColumn: true, // 등급(회수) 컬럼 표시 ⭐ 신규
	showTaxColumn: true, // 세지원 컬럼 표시
	showNetColumn: true, // 실지급액 컬럼 표시
	showPlannerColumn: true, // 설계자 컬럼 표시 (관리자 전용)
	showBankColumn: true, // 은행 컬럼 표시
	showAccountColumn: true, // 계좌번호 컬럼 표시
	// 검색 관련
	searchQuery: '', // 검색어
	searchCategory: 'name', // 'name' | 'planner'
	// 정렬 관련
	sortByName: true // true: 이름순, false: 등록일순
});

// 설계사 지급명부 필터 상태 (PaymentListCard 공유)
export const plannerPaymentFilterState = writable({
	filterType: 'date', // 'date' | 'period'
	selectedDate: today.toISOString().split('T')[0],
	selectedYear: today.getFullYear(),
	selectedMonth: today.getMonth() + 1,
	periodType: 'weekly', // 'weekly' | 'monthly'
	startYear: today.getFullYear(),
	startMonth: today.getMonth() + 1,
	endYear: today.getFullYear(),
	endMonth: today.getMonth() + 1,
	// ⭐ 주별 기간 선택용 (설계사용) - 기본: 이번주 ~ 4주 후
	startWeekDate: defaultStartWeekDate,
	endWeekDate: defaultEndWeekDate,
	itemsPerPage: 20,
	// 컬럼 표시 설정
	showGradeInfoColumn: true, // 등급(회수) 컬럼 표시
	showTaxColumn: true, // 세지원 컬럼 표시
	showNetColumn: true, // 실지급액 컬럼 표시
	showBankColumn: true, // 은행 컬럼 표시
	showAccountColumn: true, // 계좌번호 컬럼 표시
	// 검색 관련
	searchQuery: '', // 검색어
	searchCategory: 'name', // 'name' | 'grade'
	// ⭐ 소계 표시 모드 (설계사 전용)
	subtotalDisplayMode: 'withSubtotals' // 'noSubtotals' (소계없이) | 'withSubtotals' (소계포함) | 'subtotalsOnly' (소계만)
});
