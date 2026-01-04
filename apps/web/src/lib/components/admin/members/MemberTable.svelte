<script>
	import GradeBadge from '$lib/components/GradeBadge.svelte';
	import { GRADE_LIMITS } from '$lib/utils/constants.js';

	export let members = [];
	export let isLoading = false;
	export let currentPage = 1;
	export let itemsPerPage = 20;
	export let sortBy = 'sequence';
	export let sortOrder = 'asc';
	export let visibleColumns = {};
	export let onSort = (field) => {};
	export let onEdit = (member) => {};

	// 유지 상태 및 비율 계산
	function getInsuranceInfo(member) {
		const gradeLimit = GRADE_LIMITS[member.grade];
		const isRequired = gradeLimit?.insuranceRequired || false;
		const isActive = member.insuranceActive || false;

		// 비율 = 지급 진행률 (completedInstallments / maxInstallments)
		const ratio = member.paymentRatio || 0;

		return {
			isRequired,
			isActive,
			ratio
		};
	}

	// ⭐ 보험 유지 만료 날짜 계산 (승급 후 2달 첫 금요일)
	function getInsuranceDeadline(member) {
		const gradeLimit = GRADE_LIMITS[member.grade];
		if (!gradeLimit?.insuranceRequired) return null;

		if (!member.gradeHistory || member.gradeHistory.length === 0) {
			return null;
		}

		// 현재 등급으로 승급한 날짜 찾기 (가장 최근)
		const currentGrade = member.grade;
		const promotionRecord = [...member.gradeHistory]
			.reverse()
			.find(h => h.toGrade === currentGrade && h.type === 'promotion');

		let baseDate;
		if (!promotionRecord) {
			// 승급 기록이 없으면 등록일 기준
			const registrationRecord = member.gradeHistory.find(h => h.type === 'registration');
			if (!registrationRecord) return null;
			baseDate = new Date(registrationRecord.date);
		} else {
			baseDate = new Date(promotionRecord.date);
		}

		// 2달 후 첫 금요일 계산
		const twoMonthsLater = new Date(baseDate);
		twoMonthsLater.setMonth(twoMonthsLater.getMonth() + 2);

		const dayOfWeek = twoMonthsLater.getDay();
		const daysUntilFriday = (5 - dayOfWeek + 7) % 7;

		const firstFriday = new Date(twoMonthsLater);
		if (daysUntilFriday === 0 && twoMonthsLater.getDay() !== 5) {
			firstFriday.setDate(firstFriday.getDate() + 7);
		} else {
			firstFriday.setDate(firstFriday.getDate() + daysUntilFriday);
		}

		return firstFriday;
	}

	// 날짜 포맷 (YYYY-MM-DD)
	function formatDeadlineDate(date) {
		if (!date) return '-';
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
	}

	// ⭐ 최종 승급일 조회 (승급일 없으면 등록일 반환)
	function getLastPromotionDate(member) {
		if (!member.gradeHistory || member.gradeHistory.length === 0) {
			return null;
		}

		// promotion 타입인 기록 중 가장 마지막 것
		const promotions = member.gradeHistory.filter(h => h.type === 'promotion');
		if (promotions.length > 0) {
			const lastPromotion = promotions[promotions.length - 1];
			return new Date(lastPromotion.date);
		}

		// 승급 기록이 없으면 등록일 반환
		const registration = member.gradeHistory.find(h => h.type === 'registration');
		if (registration) {
			return new Date(registration.date);
		}
		return null;
	}
</script>

{#if isLoading}
	<div class="loading-state">데이터를 불러오는 중...</div>
{:else}
	<!-- 테이블 래퍼 -->
	<div class="table-wrapper">
		<table class="member-table">
			<thead>
				<tr>
					<th class="th-base th-number">순번</th>
					{#if visibleColumns.insurance}
						<th class="th-base th-insurance">유/비</th>
					{/if}
					{#if visibleColumns.name}
						<th onclick={() => onSort('name')} class="th-base th-sortable th-name">
							성명 {#if sortBy === 'name'}{sortOrder === 'asc' ? '↑' : '↓'}{/if}
						</th>
					{/if}
					{#if visibleColumns.date}
						<th onclick={() => onSort('createdAt')} class="th-base th-sortable">
							등록일 {#if sortBy === 'createdAt'}{sortOrder === 'asc' ? '↑' : '↓'}{/if}
						</th>
					{/if}
					{#if visibleColumns.promotionDate}
						<th class="th-base">승급일</th>
					{/if}
					{#if visibleColumns.insuranceDeadline}
						<th class="th-base">가입기한</th>
					{/if}
					{#if visibleColumns.phone}
						<th class="th-base">연락처</th>
					{/if}
					{#if visibleColumns.salesperson}
						<th onclick={() => onSort('salesperson')} class="th-base th-sortable">
							판매인 {#if sortBy === 'salesperson'}{sortOrder === 'asc' ? '↑' : '↓'}{/if}
						</th>
					{/if}
					{#if visibleColumns.planner}
						<th onclick={() => onSort('planner')} class="th-base th-sortable">
							설계사 {#if sortBy === 'planner'}{sortOrder === 'asc' ? '↑' : '↓'}{/if}
						</th>
					{/if}
					{#if visibleColumns.branch}
						<th class="th-base">지사</th>
					{/if}
					{#if visibleColumns.idNumber}
						<th class="th-base">주민번호</th>
					{/if}
					{#if visibleColumns.bank}
						<th class="th-base">은행</th>
					{/if}
					{#if visibleColumns.accountNumber}
						<th class="th-base">계좌번호</th>
					{/if}
					{#if visibleColumns.plannerPhone}
						<th class="th-base">설계사 연락처</th>
					{/if}
					{#if visibleColumns.plannerAccountNumber}
						<th class="th-base">설계사 계좌번호</th>
					{/if}
					{#if visibleColumns.insuranceProduct}
						<th class="th-base">보험상품</th>
					{/if}
					{#if visibleColumns.insuranceCompany}
						<th class="th-base">보험회사</th>
					{/if}
				</tr>
			</thead>
			<tbody>
				{#if members.length === 0}
					<tr>
						<td colspan="14" class="empty-state"> 등록된 지원자가 없습니다 </td>
					</tr>
				{:else}
					{#each members as member, index}
						{@const insuranceInfo = getInsuranceInfo(member)}
						<tr class="data-row">
							<td class="td-base td-number">{(currentPage - 1) * itemsPerPage + index + 1}</td>
							{#if visibleColumns.insurance}
								<td class="td-base td-insurance">
									<div class="insurance-cell">
										{#if !insuranceInfo.isRequired}
											<span class="insurance-badge insurance-badge-na" title="보험 불필요">-</span>
										{:else if insuranceInfo.isActive}
											<span class="insurance-badge insurance-badge-active" title="보험 유지됨">유</span>
										{:else}
											<span class="insurance-badge insurance-badge-inactive" title="보험 미유지">✕</span>
										{/if}
										<span class="insurance-ratio" class:insurance-ratio-warn={insuranceInfo.isRequired && !insuranceInfo.isActive}>{insuranceInfo.ratio}</span>
									</div>
								</td>
							{/if}
							{#if visibleColumns.name}
								<td class="td-base td-name">
									<div class="flex items-center justify-center">
										<button
											onclick={() => onEdit(member)}
											class="relative inline-flex items-baseline text-blue-600 hover:text-blue-800 hover:underline cursor-pointer transition-colors"
										>
											{member.name}
											{#if member.grade}
												<img
													src="/icons/{member.grade}.svg"
													alt={member.grade}
													class="grade-icon"
													title="{member.grade} 등급"
												/>
											{/if}
										</button>
									</div>
								</td>
							{/if}
							{#if visibleColumns.date}
								<td class="td-base">
									{member.createdAt ? new Date(member.createdAt).toLocaleDateString('ko-KR').replace(/\.$/, '') : '-'}
								</td>
							{/if}
							{#if visibleColumns.promotionDate}
								{@const promoDate = getLastPromotionDate(member)}
								<td class="td-base">
									{promoDate ? promoDate.toLocaleDateString('ko-KR').replace(/\.$/, '') : '-'}
								</td>
							{/if}
							{#if visibleColumns.insuranceDeadline}
								{@const deadline = getInsuranceDeadline(member)}
								{@const isOverdue = deadline && !member.insuranceActive && deadline > new Date()}
								<td class="td-base {isOverdue ? 'text-red-600' : ''}">
									{formatDeadlineDate(deadline)}
								</td>
							{/if}
							{#if visibleColumns.phone}
								<td class="td-base">{member.phone || '-'}</td>
							{/if}
							{#if visibleColumns.salesperson}
								<td class="td-base">{member.salesperson || '-'}</td>
							{/if}
							{#if visibleColumns.planner}
								<td class="td-base">{member.planner || '-'}</td>
							{/if}
							{#if visibleColumns.branch}
								<td class="td-base">{member.branch || '-'}</td>
							{/if}
							{#if visibleColumns.idNumber}
								<td class="td-base">{member.idNumber || '-'}</td>
							{/if}
							{#if visibleColumns.bank}
								<td class="td-base">{member.bank || '-'}</td>
							{/if}
							{#if visibleColumns.accountNumber}
								<td class="td-base">{member.accountNumber || '-'}</td>
							{/if}
							{#if visibleColumns.plannerPhone}
								<td class="td-base">{member.plannerPhone || '-'}</td>
							{/if}
							{#if visibleColumns.plannerAccountNumber}
								<td class="td-base">{member.plannerAccountNumber || '-'}</td>
							{/if}
							{#if visibleColumns.insuranceProduct}
								<td class="td-base">{member.insuranceProduct || '-'}</td>
							{/if}
							{#if visibleColumns.insuranceCompany}
								<td class="td-base">{member.insuranceCompany || '-'}</td>
							{/if}
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>
{/if}

<style>
	@reference "$lib/../app.css";

	/* 로딩 상태 */
	.loading-state {
		@apply py-10 text-center text-base;
	}

	/* 빈 상태 */
	.empty-state {
		@apply border-b border-l border-r border-gray-300 bg-white py-10 text-center italic text-gray-600;
	}

	/* 테이블 래퍼 */
	.table-wrapper {
		@apply relative overflow-x-auto border border-gray-300 bg-white;
	}

	.table-wrapper::-webkit-scrollbar {
		@apply h-2.5;
	}

	.table-wrapper::-webkit-scrollbar-track {
		@apply bg-gray-100;
	}

	.table-wrapper::-webkit-scrollbar-thumb {
		@apply rounded bg-gray-400;
	}

	.table-wrapper::-webkit-scrollbar-thumb:hover {
		@apply bg-gray-600;
	}

	/* 테이블 기본 */
	.member-table {
		@apply w-full min-w-max border-separate border-spacing-0;
	}

	/* 헤더 - 기본 */
	.th-base {
		@apply border-b border-r border-t border-gray-300 bg-gray-200;
		@apply whitespace-nowrap p-1.5 text-center text-sm font-bold;
	}

	.th-base:first-child {
		@apply border-l;
	}

	/* 헤더 - 정렬 가능 */
	.th-sortable {
		@apply cursor-pointer transition-colors hover:bg-gray-300;
	}

	/* 데이터 행 */
	.data-row:hover td {
		@apply bg-black/[0.02];
	}

	/* 데이터 셀 - 기본 */
	.td-base {
		@apply border-b border-r border-gray-300;
		@apply whitespace-nowrap p-1.5 text-center text-sm;
	}

	.td-base:first-child {
		@apply border-l;
	}

	/* 순번 컬럼 고정 너비 */
	.th-number {
		@apply min-w-[60px] max-w-[60px] w-[60px];
	}

	.td-number {
		@apply min-w-[60px] max-w-[60px] w-[60px];
	}

	/* 성명 컬럼 고정 너비 */
	.th-name {
		@apply min-w-[120px] max-w-[120px] w-[120px];
	}

	.td-name {
		@apply min-w-[120px] max-w-[120px] w-[120px];
	}

	/* 모바일에서 성명 컬럼 너비 조정 */
	@media (max-width: 768px) {
		.th-number {
			@apply min-w-[50px] max-w-[50px] w-[50px];
		}

		.td-number {
			@apply min-w-[50px] max-w-[50px] w-[50px];
		}

		.th-name {
			@apply min-w-[95px] max-w-[95px] w-[95px];
		}

		.td-name {
			@apply min-w-[95px] max-w-[95px] w-[95px];
		}
	}

	/* 등급 아이콘 */
	.grade-icon {
		@apply absolute -right-5 -top-1.5 h-5 w-5;
	}

	/* 유지/비율 컬럼 */
	.th-insurance {
		@apply min-w-[70px] max-w-[70px] w-[70px];
	}

	.td-insurance {
		@apply min-w-[70px] max-w-[70px] w-[70px];
	}

	.insurance-cell {
		@apply flex items-center justify-center gap-0.5;
	}

	/* 유지 배지 - 기본 (고정 너비) */
	.insurance-badge {
		@apply inline-flex items-center justify-center w-5 h-5 rounded text-xs font-bold flex-shrink-0;
	}

	/* 비율 텍스트 (고정 너비) */
	.insurance-ratio {
		@apply text-xs text-gray-600 w-7 text-left tabular-nums;
	}

	.insurance-ratio-warn {
		@apply text-red-500;
	}

	/* 유지됨 (녹색) */
	.insurance-badge-active {
		@apply bg-green-100 text-green-700 border border-green-300;
	}

	/* 미유지 (빨강) */
	.insurance-badge-inactive {
		@apply bg-red-100 text-red-600 border border-red-300;
	}

	/* 불필요 (회색) */
	.insurance-badge-na {
		@apply bg-gray-100 text-gray-400 border border-gray-200;
	}

	/* 모바일 대응 */
	@media (max-width: 768px) {
		.th-insurance {
			@apply min-w-[70px] max-w-[70px] w-[70px];
		}

		.td-insurance {
			@apply min-w-[70px] max-w-[70px] w-[70px];
		}
	}
</style>
