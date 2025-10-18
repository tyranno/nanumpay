import { writable } from 'svelte/store';

/**
 * 관리자 대시보드 카드별 상태 관리 Store
 * 모바일 ↔ 웹 전환 시에도 선택사항 유지
 */

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
	viewMode: 'monthly', // 'monthly' (월간) | 'weekly' (주간)
	startYear: new Date().getFullYear(),
	startMonth: new Date().getMonth() + 1,
	endYear: new Date().getFullYear(),
	endMonth: new Date().getMonth() + 1
});
