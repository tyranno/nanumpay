<script>
	import WindowsModal from '$lib/components/WindowsModal.svelte';

	export let isOpen = false;
	export let monthKey = '';
	export let gradeDistribution = {};
	export let currentPayments = {};
	export let adjustedPayments = {};
	export let onClose = () => {};
	export let onSave = () => {};

	// 등급별 조정 데이터
	let adjustments = {
		F1: { totalAmount: '', perInstallment: 0, hasUsers: false },
		F2: { totalAmount: '', perInstallment: 0, hasUsers: false },
		F3: { totalAmount: '', perInstallment: 0, hasUsers: false },
		F4: { totalAmount: '', perInstallment: 0, hasUsers: false },
		F5: { totalAmount: '', perInstallment: 0, hasUsers: false },
		F6: { totalAmount: '', perInstallment: 0, hasUsers: false },
		F7: { totalAmount: '', perInstallment: 0, hasUsers: false },
		F8: { totalAmount: '', perInstallment: 0, hasUsers: false }
	};

	// 등급별 기본 지급액 (참고용)
	const basePayments = {
		F1: 240000,
		F2: 810000,
		F3: 1890000,
		F4: 3240000,
		F5: 5400000,
		F6: 8100000,
		F7: 12150000,
		F8: 16200000
	};

	// Modal이 열릴 때 데이터 초기화
	$: if (isOpen) {
		initializeData();
	}

	function initializeData() {
		const grades = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'];

		grades.forEach(grade => {
			const userCount = gradeDistribution[grade] || 0;
			const hasUsers = userCount > 0;

			// 기존 조정값이 있으면 사용, 없으면 현재 지급액 사용
			let totalAmount = '';
			if (adjustedPayments?.[grade]?.totalAmount !== null && adjustedPayments?.[grade]?.totalAmount !== undefined) {
				totalAmount = adjustedPayments[grade].totalAmount.toString();
			} else if (currentPayments?.[grade]) {
				totalAmount = currentPayments[grade].toString();
			}

			adjustments[grade] = {
				totalAmount: totalAmount,
				perInstallment: totalAmount ? Math.floor(Number(totalAmount) / 10) : 0,
				hasUsers: hasUsers,
				userCount: userCount
			};
		});

		// 강제 업데이트
		adjustments = { ...adjustments };
	}

	// 총액 입력 시 10분할 금액 자동 계산
	function handleTotalAmountChange(grade) {
		const totalAmount = adjustments[grade].totalAmount;
		if (totalAmount && !isNaN(totalAmount)) {
			adjustments[grade].perInstallment = Math.floor(Number(totalAmount) / 10);
		} else {
			adjustments[grade].perInstallment = 0;
		}
		// 강제 업데이트
		adjustments = { ...adjustments };
	}

	// 저장
	function handleSave() {
		const result = {};
		const grades = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'];

		grades.forEach(grade => {
			if (adjustments[grade].hasUsers && adjustments[grade].totalAmount) {
				const totalAmount = Number(adjustments[grade].totalAmount);
				if (totalAmount > 0) {
					result[grade] = {
						totalAmount: totalAmount,
						perInstallment: Math.floor(totalAmount / 10)
					};
				}
			}
		});

		onSave(result);
		handleClose();
	}

	// 닫기
	function handleClose() {
		// 초기화
		adjustments = {
			F1: { totalAmount: '', perInstallment: 0, hasUsers: false },
			F2: { totalAmount: '', perInstallment: 0, hasUsers: false },
			F3: { totalAmount: '', perInstallment: 0, hasUsers: false },
			F4: { totalAmount: '', perInstallment: 0, hasUsers: false },
			F5: { totalAmount: '', perInstallment: 0, hasUsers: false },
			F6: { totalAmount: '', perInstallment: 0, hasUsers: false },
			F7: { totalAmount: '', perInstallment: 0, hasUsers: false },
			F8: { totalAmount: '', perInstallment: 0, hasUsers: false }
		};
		onClose();
	}

	// 금액 포맷팅
	function formatAmount(amount) {
		if (!amount && amount !== 0) return '-';
		return Number(amount).toLocaleString();
	}

	// 초기화
	function handleReset(grade) {
		adjustments[grade].totalAmount = '';
		adjustments[grade].perInstallment = 0;
		adjustments = { ...adjustments };
	}
</script>

<WindowsModal
	{isOpen}
	title="등급별 지급 총액 조정"
	icon="/icons/edit-blue.svg"
	size="lg"
	onClose={handleClose}
>
	<div class="modal-content">
		<div class="info-box">
			<p class="info-title">📊 {monthKey} 등급별 지급 총액 조정</p>
			<p class="info-desc">
				각 등급의 지급 총액을 직접 설정할 수 있습니다.<br>
				총액을 입력하면 10분할 금액이 자동으로 계산됩니다.
			</p>
		</div>

		<div class="table-container">
			<table class="adjustment-table">
				<thead>
					<tr>
						<th>등급</th>
						<th>인원</th>
						<th>기본 총액</th>
						<th>현재 총액</th>
						<th>조정 총액</th>
						<th>10분할금</th>
						<th>동작</th>
					</tr>
				</thead>
				<tbody>
					{#each ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'] as grade}
						<tr class:disabled={!adjustments[grade].hasUsers}>
							<td class="grade-cell">{grade}</td>
							<td class="count-cell">
								{adjustments[grade].userCount || 0}명
							</td>
							<td class="amount-cell">
								{formatAmount(basePayments[grade])}원
							</td>
							<td class="amount-cell">
								{currentPayments[grade] ? formatAmount(currentPayments[grade]) + '원' : '-'}
							</td>
							<td class="input-cell">
								{#if adjustments[grade].hasUsers}
									<input
										type="number"
										bind:value={adjustments[grade].totalAmount}
										oninput={() => handleTotalAmountChange(grade)}
										placeholder="총액 입력"
										class="amount-input"
										min="0"
										step="10000"
									/>
								{:else}
									<span class="no-users">-</span>
								{/if}
							</td>
							<td class="amount-cell">
								{#if adjustments[grade].hasUsers && adjustments[grade].perInstallment > 0}
									{formatAmount(adjustments[grade].perInstallment)}원
								{:else}
									-
								{/if}
							</td>
							<td class="action-cell">
								{#if adjustments[grade].hasUsers && adjustments[grade].totalAmount}
									<button
										onclick={() => handleReset(grade)}
										class="btn-reset"
										title="초기화"
									>
										초기화
									</button>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<div class="summary-box">
			<p class="summary-title">💡 참고사항</p>
			<ul class="summary-list">
				<li>인원이 있는 등급만 조정 가능합니다</li>
				<li>조정된 금액은 해당 월의 모든 지급 계획에 적용됩니다</li>
				<li>10분할금은 총액 ÷ 10으로 자동 계산됩니다</li>
			</ul>
		</div>
	</div>

	<svelte:fragment slot="footer">
		<button onclick={handleClose} class="btn-modal-cancel">
			취소
		</button>
		<button onclick={handleSave} class="btn-modal-primary">
			저장
		</button>
	</svelte:fragment>
</WindowsModal>

<style>
	.modal-content {
		padding: 10px;
	}

	.info-box {
		background: #f0f9ff;
		border: 1px solid #bfdbfe;
		border-radius: 8px;
		padding: 12px;
		margin-bottom: 20px;
	}

	.info-title {
		font-size: 14px;
		font-weight: 600;
		color: #1e40af;
		margin-bottom: 4px;
	}

	.info-desc {
		font-size: 12px;
		color: #64748b;
		line-height: 1.5;
	}

	.table-container {
		overflow-x: auto;
		margin-bottom: 20px;
	}

	.adjustment-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 13px;
	}

	.adjustment-table thead {
		background: #f8fafc;
	}

	.adjustment-table th {
		padding: 10px 8px;
		text-align: left;
		font-weight: 600;
		color: #475569;
		border-bottom: 2px solid #e2e8f0;
		white-space: nowrap;
	}

	.adjustment-table tbody tr {
		border-bottom: 1px solid #e2e8f0;
	}

	.adjustment-table tbody tr:hover:not(.disabled) {
		background: #f8fafc;
	}

	.adjustment-table tbody tr.disabled {
		opacity: 0.5;
		background: #f9fafb;
	}

	.adjustment-table td {
		padding: 8px;
	}

	.grade-cell {
		font-weight: 600;
		color: #1e293b;
	}

	.count-cell {
		text-align: center;
		color: #64748b;
	}

	.amount-cell {
		text-align: right;
		font-family: monospace;
		color: #334155;
	}

	.input-cell {
		width: 150px;
	}

	.amount-input {
		width: 100%;
		padding: 4px 8px;
		border: 1px solid #cbd5e1;
		border-radius: 4px;
		font-size: 13px;
		text-align: right;
		font-family: monospace;
	}

	.amount-input:focus {
		outline: none;
		border-color: #3b82f6;
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
	}

	.no-users {
		color: #cbd5e1;
		display: block;
		text-align: center;
	}

	.action-cell {
		text-align: center;
	}

	.btn-reset {
		padding: 2px 8px;
		font-size: 11px;
		color: #ef4444;
		background: white;
		border: 1px solid #fecaca;
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.btn-reset:hover {
		background: #fef2f2;
		border-color: #fca5a5;
	}

	.summary-box {
		background: #fefce8;
		border: 1px solid #fde68a;
		border-radius: 8px;
		padding: 12px;
	}

	.summary-title {
		font-size: 13px;
		font-weight: 600;
		color: #a16207;
		margin-bottom: 8px;
	}

	.summary-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.summary-list li {
		font-size: 12px;
		color: #854d0e;
		padding-left: 16px;
		position: relative;
		margin-bottom: 4px;
	}

	.summary-list li::before {
		content: '•';
		position: absolute;
		left: 4px;
	}

	.btn-modal-cancel {
		padding: 8px 16px;
		font-size: 13px;
		color: #64748b;
		background: white;
		border: 1px solid #e2e8f0;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.btn-modal-cancel:hover {
		background: #f8fafc;
		border-color: #cbd5e1;
	}

	.btn-modal-primary {
		padding: 8px 16px;
		font-size: 13px;
		color: white;
		background: #3b82f6;
		border: 1px solid #3b82f6;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.btn-modal-primary:hover {
		background: #2563eb;
		border-color: #2563eb;
	}
</style>