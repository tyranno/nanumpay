<script>
	import WindowsModal from '$lib/components/WindowsModal.svelte';

	export let isOpen = false;
	export let userName = '';
	export let weekLabel = '';
	export let userId = '';
	export let weekInfo = null;  // { year, month, week }
	export let onClose = () => {};

	let installments = [];
	let isLoading = false;
	let error = '';

	// isOpen이 true가 되고 userId와 weekInfo가 있으면 API 호출
	$: if (isOpen && userId && weekInfo) {
		fetchInstallmentDetails();
	}

	async function fetchInstallmentDetails() {
		isLoading = true;
		error = '';
		installments = [];

		try {
			const params = new URLSearchParams({
				userId,
				year: weekInfo.year,
				month: weekInfo.month,
				week: weekInfo.week
			});
			const response = await fetch(`/api/admin/payment/installment-details?${params}`);
			const result = await response.json();

			if (result.success) {
				installments = result.data;
			} else {
				error = result.error || '데이터 조회 실패';
			}
		} catch (e) {
			error = e.message;
		} finally {
			isLoading = false;
		}
	}

	// 금액 포맷
	function formatAmount(amount) {
		if (!amount && amount !== 0) return '-';
		return amount.toLocaleString() + '원';
	}

	// 날짜 포맷 (연.월.일)
	function formatDate(dateStr) {
		if (!dateStr) return '-';
		const date = new Date(dateStr);
		const year = date.getFullYear();
		const month = date.getMonth() + 1;
		const day = date.getDate();
		return `${year}.${month}.${day}`;
	}

	// 구분 텍스트
	function getTypeLabel(planType, additionalStep) {
		if (additionalStep > 0) {
			return `추가${additionalStep}차`;
		}
		return planType === 'initial' ? '등록' : '승급';
	}

	// 구분 스타일 클래스
	function getTypeClass(planType, additionalStep) {
		if (additionalStep > 0) {
			return 'type-additional';
		}
		return planType === 'initial' ? 'type-initial' : 'type-promotion';
	}
</script>

<WindowsModal {isOpen} title="{userName} - {weekLabel} 지급 상세" size="xl" {onClose}>
	{#if isLoading}
		<div class="loading-state">데이터를 불러오는 중...</div>
	{:else if error}
		<div class="error-state">{error}</div>
	{:else if installments.length > 0}
		<div class="table-wrapper">
			<table class="plan-table">
				<thead>
					<tr>
						<th>등급</th>
						<th>매출월</th>
						<th>구분</th>
						<th>등록/승급일</th>
						<th>지급시작일</th>
						<th>회차</th>
						<th>금액</th>
					</tr>
				</thead>
				<tbody>
					{#each installments as item}
						<tr>
							<td>
								<span class="plan-grade">{item.baseGrade}</span>
							</td>
							<td>{item.revenueMonth?.substring(5)}월</td>
							<td>
								<span class="plan-type {getTypeClass(item.planType, item.추가지급단계 || 0)}">
									{getTypeLabel(item.planType, item.추가지급단계 || 0)}
								</span>
							</td>
							<td class="date-cell">{formatDate(item.baseDate)}</td>
							<td class="date-cell">{formatDate(item.startDate)}</td>
							<td>{item.week}회차</td>
							<td class="amount-cell">
								{formatAmount(item.amount)}
							</td>
						</tr>
					{/each}
				</tbody>
				<tfoot>
					<tr class="total-row">
						<td colspan="6">합계</td>
						<td class="amount-cell">
							{formatAmount(installments.reduce((sum, item) => sum + (item.amount || 0), 0))}
						</td>
					</tr>
				</tfoot>
			</table>
		</div>
	{:else}
		<div class="empty-state">지급 내역이 없습니다.</div>
	{/if}

	<svelte:fragment slot="footer">
		<button class="btn-close" on:click={onClose}>닫기</button>
	</svelte:fragment>
</WindowsModal>

<style>
	.loading-state {
		padding: 40px;
		text-align: center;
		color: #6b7280;
	}

	.error-state {
		padding: 40px;
		text-align: center;
		color: #dc2626;
	}

	.empty-state {
		padding: 40px;
		text-align: center;
		color: #6b7280;
	}

	/* 테이블 래퍼 */
	.table-wrapper {
		overflow-x: auto;
	}

	/* 지급 계획 테이블 */
	.plan-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;
	}

	.plan-table th {
		background: #e5e7eb;
		padding: 10px 8px;
		text-align: center;
		font-weight: 600;
		border-bottom: 2px solid #d1d5db;
	}

	.plan-table td {
		padding: 10px 8px;
		text-align: center;
		border-bottom: 1px solid #e5e7eb;
		white-space: nowrap;
	}

	.plan-table tbody tr:hover {
		background: #f9fafb;
	}

	.plan-grade {
		font-weight: 700;
		color: #1f2937;
	}

	.plan-type {
		font-size: 0.75rem;
		padding: 2px 10px;
		border-radius: 4px;
		white-space: nowrap;
		display: inline-block;
		min-width: 50px;
	}

	.type-initial {
		background: #dbeafe;
		color: #1d4ed8;
	}

	.type-promotion {
		background: #dcfce7;
		color: #15803d;
	}

	.type-additional {
		background: #fef3c7;
		color: #b45309;
	}

	.date-cell {
		font-size: 0.8rem;
		color: #6b7280;
	}

	.amount-cell {
		text-align: right;
		font-weight: 600;
	}

	.total-row {
		background: #f3f4f6;
		font-weight: 700;
	}

	.total-row td {
		border-top: 2px solid #d1d5db;
	}

	/* 닫기 버튼 */
	.btn-close {
		padding: 4px 14px;
		background: #6b7280;
		color: white;
		border: none;
		border-radius: 4px;
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
	}

	.btn-close:hover {
		background: #4b5563;
	}

	/* 반응형 */
	@media (max-width: 640px) {
		.plan-table {
			font-size: 0.75rem;
		}

		.plan-table th,
		.plan-table td {
			padding: 8px 4px;
		}
	}
</style>
