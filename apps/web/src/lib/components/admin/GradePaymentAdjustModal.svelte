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

			// 기존 조정값이 있으면 사용, 없으면 빈 값
			let totalAmount = '';
			if (adjustedPayments?.[grade]?.totalAmount !== null && adjustedPayments?.[grade]?.totalAmount !== undefined) {
				// 100원 단위로 절삭하여 저장
				const rounded = Math.floor(Number(adjustedPayments[grade].totalAmount) / 100) * 100;
				totalAmount = rounded.toString();
			}

			adjustments[grade] = {
				totalAmount: totalAmount,
				perInstallment: totalAmount ? Math.floor(Number(totalAmount) / 10 / 100) * 100 : 0,
				hasUsers: hasUsers,
				userCount: userCount
			};
		});

		// 강제 업데이트
		adjustments = { ...adjustments };
	}

	// 총액 입력 시 10분할 금액 자동 계산
	function handleTotalAmountInput(grade, event) {
		// 콤마 제거하고 숫자만 추출
		const value = event.target.value.replace(/,/g, '');
		const numValue = Number(value);

		if (value && !isNaN(numValue)) {
			adjustments[grade].totalAmount = numValue;
			// 10분할 금액 100원 단위 절삭
			adjustments[grade].perInstallment = Math.floor(numValue / 10 / 100) * 100;
		} else {
			adjustments[grade].totalAmount = '';
			adjustments[grade].perInstallment = 0;
		}
		// 강제 업데이트
		adjustments = { ...adjustments };
	}

	// 입력 완료 시 100원 단위로 절삭 및 포맷팅
	function handleTotalAmountBlur(grade) {
		const totalAmount = adjustments[grade].totalAmount;
		if (totalAmount && !isNaN(totalAmount)) {
			// 100원 단위로 절삭
			const rounded = Math.floor(Number(totalAmount) / 100) * 100;
			adjustments[grade].totalAmount = rounded;
			// 10분할 금액도 재계산
			adjustments[grade].perInstallment = Math.floor(rounded / 10 / 100) * 100;
			// 강제 업데이트
			adjustments = { ...adjustments };
		}
	}

	// 포커스 시 콤마 제거
	function handleTotalAmountFocus(grade) {
		// 숫자만 남기고 편집 가능하게
	}

	// 금액 표시용 (콤마 포함)
	function getDisplayAmount(amount) {
		if (!amount && amount !== 0) return '';
		return Number(amount).toLocaleString();
	}

	// 저장
	function handleSave() {
		const result = {};
		const grades = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'];

		grades.forEach(grade => {
			// 총액이 입력되었으면 저장, 비어있으면 null로 설정 (자동 계산)
			if (adjustments[grade].totalAmount && adjustments[grade].totalAmount !== '') {
				const totalAmount = Number(adjustments[grade].totalAmount);
				if (totalAmount > 0) {
					result[grade] = {
						totalAmount: totalAmount,
						perInstallment: Math.floor(totalAmount / 10)
					};
				} else {
					// 0 이하면 자동 계산으로
					result[grade] = {
						totalAmount: null,
						perInstallment: null
					};
				}
			} else {
				// 비어있으면 자동 계산으로
				result[grade] = {
					totalAmount: null,
					perInstallment: null
				};
			}
		});

		onSave(result);
		handleClose();
	}

	// 자동 계산으로 복귀 (모든 등급)
	function handleResetToAuto() {
		if (!confirm('모든 등급의 수동 설정을 초기화하고 자동 계산으로 복귀하시겠습니까?')) {
			return;
		}

		const grades = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'];
		grades.forEach(grade => {
			adjustments[grade].totalAmount = '';
			adjustments[grade].perInstallment = 0;
		});
		adjustments = { ...adjustments };

		// 즉시 저장
		const result = {};
		grades.forEach(grade => {
			result[grade] = {
				totalAmount: null,
				perInstallment: null
			};
		});
		onSave(result);
		handleClose();
	}

	// 특정 등급만 자동 계산으로 복귀
	function handleResetGradeToAuto(grade) {
		adjustments[grade].totalAmount = '';
		adjustments[grade].perInstallment = 0;
		adjustments = { ...adjustments };
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

	// 금액 포맷팅 (100원 단위 절삭)
	function formatAmount(amount) {
		if (!amount && amount !== 0) return '-';
		const rounded = Math.floor(Number(amount) / 100) * 100;
		return rounded.toLocaleString();
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
				각 등급의 지급 총액을 직접 설정할 수 있습니다. 총액을 입력하면 10분할 금액이 자동으로 계산됩니다. 비워두면 자동 계산됩니다.
			</p>
		</div>

		<div class="table-container">
			<table class="adjustment-table">
				<thead>
					<tr>
						<th>등급</th>
						<th>인원</th>
						<th>모드</th>
						<th>기본 총액</th>
						<th>조정 총액</th>
						<th>10분할금</th>
					</tr>
				</thead>
				<tbody>
					{#each ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'] as grade}
						{@const isManual = adjustedPayments?.[grade]?.totalAmount !== null && adjustedPayments?.[grade]?.totalAmount !== undefined}
						{@const hasInput = adjustments[grade].totalAmount && adjustments[grade].totalAmount !== ''}
						{@const baseAmount = currentPayments?.[grade] || 0}
						{@const displayAmount = adjustments[grade].perInstallment > 0
							? adjustments[grade].perInstallment
							: Math.floor(baseAmount / 10 / 100) * 100}
						<tr class:manual-mode={isManual}>
							<td class="grade-cell">{grade}</td>
							<td class="count-cell">
								{adjustments[grade].userCount || 0}명
							</td>
							<td class="mode-cell">
								<label class="switch">
									<input
										type="checkbox"
										checked={hasInput}
										onchange={() => {
											if (hasInput) {
												handleResetGradeToAuto(grade);
											}
										}}
									/>
									<span class="slider"></span>
								</label>
								<span class="mode-label">{hasInput ? '수동' : '자동'}</span>
							</td>
							<td class="amount-cell">
								{formatAmount(currentPayments?.[grade] || 0)}원
							</td>
							<td class="input-cell">
								<input
									type="text"
									value={getDisplayAmount(adjustments[grade].totalAmount)}
									oninput={(e) => handleTotalAmountInput(grade, e)}
									onblur={() => handleTotalAmountBlur(grade)}
									class="amount-input"
								/>
							</td>
							<td class="amount-cell">
								{#if displayAmount > 0}
									{formatAmount(displayAmount)}원
								{:else}
									0원
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
				<li><strong>수동 모드</strong>: 입력한 금액으로 지급계획이 생성/업데이트됩니다</li>
				<li><strong>자동 모드</strong>: 매출과 등급 분포에 따라 자동으로 계산됩니다</li>
				<li>자동 복귀 시 해당 월의 모든 지급계획이 재계산됩니다</li>
				<li>인원이 0명인 등급도 미리 조정 가능합니다 (수동 모드)</li>
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
		padding: 8px;
	}

	.info-box {
		background: #f0f9ff;
		border: 1px solid #bfdbfe;
		border-radius: 6px;
		padding: 8px 10px;
		margin-bottom: 10px;
	}

	.info-title {
		font-size: 13px;
		font-weight: 600;
		color: #1e40af;
		margin-bottom: 3px;
	}

	.info-desc {
		font-size: 11px;
		color: #64748b;
		line-height: 1.4;
	}

	.table-container {
		overflow-x: auto;
		margin-bottom: 10px;
	}

	.adjustment-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 12px;
	}

	.adjustment-table thead {
		background: #f8fafc;
	}

	.adjustment-table th {
		padding: 4px 3px;
		text-align: left;
		font-weight: 600;
		color: #475569;
		border-bottom: 2px solid #e2e8f0;
		white-space: nowrap;
		line-height: 1.2;
	}

	.adjustment-table tbody tr {
		border-bottom: 1px solid #e2e8f0;
		height: 28px;
	}

	.adjustment-table tbody tr:hover {
		background: #f8fafc;
	}

	.adjustment-table tbody tr.manual-mode {
		background: #fef3c7;
	}

	.adjustment-table tbody tr.manual-mode:hover {
		background: #fef08a;
	}

	.adjustment-table td {
		padding: 2px 3px;
		line-height: 1.2;
	}

	.grade-cell {
		font-weight: 600;
		color: #1e293b;
		width: 40px;
		min-width: 40px;
	}

	.count-cell {
		text-align: center;
		color: #64748b;
		width: 50px;
		min-width: 50px;
	}

	.mode-cell {
		text-align: center;
		width: 70px;
		min-width: 70px;
	}

	.switch {
		position: relative;
		display: inline-block;
		width: 32px;
		height: 16px;
		margin-right: 4px;
		vertical-align: middle;
	}

	.switch input {
		opacity: 0;
		width: 0;
		height: 0;
	}

	.slider {
		position: absolute;
		cursor: pointer;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background-color: #d1fae5;
		transition: .3s;
		border-radius: 16px;
	}

	.slider:before {
		position: absolute;
		content: "";
		height: 12px;
		width: 12px;
		left: 2px;
		bottom: 2px;
		background-color: #059669;
		transition: .3s;
		border-radius: 50%;
	}

	input:checked + .slider {
		background-color: #fef3c7;
	}

	input:checked + .slider:before {
		background-color: #f59e0b;
		transform: translateX(16px);
	}

	.mode-label {
		font-size: 9px;
		color: #64748b;
		vertical-align: middle;
		display: inline-block;
		min-width: 24px;
	}

	.amount-cell {
		text-align: right;
		font-family: monospace;
		color: #334155;
		width: 80px;
		min-width: 80px;
		font-size: 11px;
	}

	.input-cell {
		width: 80px;
		min-width: 80px;
	}

	.amount-input {
		width: 100%;
		padding: 3px 5px;
		border: 1px solid #cbd5e1;
		border-radius: 3px;
		font-size: 11px;
		text-align: right;
		font-family: monospace;
		height: 22px;
		line-height: 1;
	}

	.amount-input:focus {
		outline: none;
		border-color: #3b82f6;
		box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
	}

	.summary-box {
		background: #fefce8;
		border: 1px solid #fde68a;
		border-radius: 6px;
		padding: 8px 10px;
	}

	.summary-title {
		font-size: 12px;
		font-weight: 600;
		color: #a16207;
		margin-bottom: 5px;
	}

	.summary-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.summary-list li {
		font-size: 11px;
		color: #854d0e;
		padding-left: 12px;
		position: relative;
		margin-bottom: 2px;
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