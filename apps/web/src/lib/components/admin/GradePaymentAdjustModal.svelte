<script>
	import { onMount } from 'svelte';
	import WindowsModal from '$lib/components/WindowsModal.svelte';

	export let isOpen = false;
	export let monthKey = '';
	export let onClose = () => {};
	export let onSave = () => {};

	// 기간 선택
	let startMonth = '';
	let endMonth = '';
	let selectedPeriod = 3; // 기본 3개월
	let monthsData = [];
	let currentMonthData = null; // 이번 달 데이터
	let isLoading = false;

	// 조정 데이터 (현재 달만)
	let adjustments = {};

	// Modal 열릴 때 초기화
	$: if (isOpen && monthKey) {
		initializeModal();
	}

	function initializeModal() {
		// 기본 3개월로 설정
		setPeriod(3);
	}

	function setPeriod(months) {
		selectedPeriod = months;
		const [year, month] = monthKey.split('-').map(Number);

		// 이번 달 제외, 이전 N개월
		const endDate = new Date(year, month - 2, 1); // 이전 달부터
		endMonth = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}`;

		const start = new Date(year, month - months - 1, 1); // N개월 전
		startMonth = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;

		loadData();
	}

	async function loadData() {
		if (!startMonth || !endMonth) return;

		try {
			isLoading = true;

			// 한 번의 API 호출로 기간별 데이터 가져오기
			const response = await fetch(
				`/api/admin/revenue/grade-adjustment?startMonth=${startMonth}&endMonth=${endMonth}`
			);

			if (!response.ok) {
				console.error('API response not ok:', response.status);
				monthsData = generateEmptyMonths(startMonth, endMonth);
			} else {
				const result = await response.json();
				monthsData = result.months || generateEmptyMonths(startMonth, endMonth);
			}

			// 현재 월 데이터 가져오기 (이번 달)
			const currentResponse = await fetch(
				`/api/admin/revenue/grade-adjustment?startMonth=${monthKey}&endMonth=${monthKey}`
			);
			if (currentResponse.ok) {
				const currentResult = await currentResponse.json();
				currentMonthData = currentResult.months?.[0] || null;
			}

			adjustments = {};

			// 현재 달 조정값 초기화
			if (currentMonthData) {
				['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'].forEach(grade => {
					const adj = currentMonthData.adjustedGradePayments?.[grade];
					adjustments[grade] = adj?.totalAmount ? adj.totalAmount.toString() : '';
				});
			}
		} catch (error) {
			console.error('Error loading data:', error);
			monthsData = generateEmptyMonths(startMonth, endMonth);
			adjustments = {};
		} finally {
			isLoading = false;
		}
	}

	// 빈 월 데이터 생성 함수
	function generateEmptyMonths(start, end) {
		const months = [];
		const [startY, startM] = start.split('-').map(Number);
		const [endY, endM] = end.split('-').map(Number);

		let current = new Date(endY, endM - 1, 1);
		const startDate = new Date(startY, startM - 1, 1);

		// 역순으로 월 생성 (최신월부터)
		while (current >= startDate) {
			const y = current.getFullYear();
			const m = String(current.getMonth() + 1).padStart(2, '0');
			months.push({
				monthKey: `${y}-${m}`,
				gradeDistribution: {},
				gradePayments: {},
				adjustedGradePayments: {}
			});
			current.setMonth(current.getMonth() - 1);
		}

		return months;
	}

	function handleInput(grade, value) {
		adjustments[grade] = value.replace(/,/g, '');
	}

	function handleBlur(grade) {
		if (adjustments[grade]) {
			const num = Number(adjustments[grade]);
			const rounded = Math.floor(num / 100) * 100;
			adjustments[grade] = rounded.toString();
		}
	}

	function formatNum(num) {
		if (!num && num !== 0) return '';
		// 100원 단위 절삭 후 표시 (표시용)
		const rounded = Math.floor(Number(num) / 100) * 100;
		return rounded.toLocaleString();
	}

	function formatInputValue(value) {
		if (!value) return '';
		// 입력 필드 표시용: 콤마만 추가 (절삭하지 않음)
		return Number(value).toLocaleString();
	}

	async function handleSave() {
		try {
			const adjustedGradePayments = {};
			['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'].forEach(grade => {
				if (adjustments[grade]) {
					adjustedGradePayments[grade] = {
						totalAmount: Number(adjustments[grade]),
						perInstallment: Math.floor(Number(adjustments[grade]) / 10 / 100) * 100
					};
				} else {
					adjustedGradePayments[grade] = { totalAmount: null, perInstallment: null };
				}
			});

			// 현재 월 키 (monthKey)
			if (!monthKey) {
				alert('저장할 월 정보가 없습니다.');
				return;
			}

			// API 호출로 저장
			const response = await fetch('/api/admin/revenue/grade-adjustment', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					monthKey: monthKey,
					adjustedGradePayments
				})
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || '저장 실패');
			}

			const result = await response.json();
			alert(result.message || '저장되었습니다.');

			// 콜백 호출
			onSave(adjustedGradePayments);
			onClose();
		} catch (error) {
			console.error('Save error:', error);
			alert(`저장 중 오류가 발생했습니다: ${error.message}`);
		}
	}
</script>

<WindowsModal {isOpen} title="등급별 지급 총액 조정" icon="/icons/edit-blue.svg" size="xl" onClose={onClose}>
	<div class="container">
		<!-- 기간 선택 -->
		<div class="period-row">
			<span class="label">조회 기간:</span>
			<div class="period-buttons">
				<button
					class="period-btn"
					class:active={selectedPeriod === 3}
					onclick={() => setPeriod(3)}
				>
					최근 3개월
				</button>
				<button
					class="period-btn"
					class:active={selectedPeriod === 6}
					onclick={() => setPeriod(6)}
				>
					최근 6개월
				</button>
				<button
					class="period-btn"
					class:active={selectedPeriod === 12}
					onclick={() => setPeriod(12)}
				>
					최근 1년
				</button>
			</div>
			<span class="period-display">
				{endMonth} ~ {startMonth}
			</span>
		</div>

		{#if isLoading}
			<div class="loading">로딩 중...</div>
		{:else}
			<!-- 테이블 래퍼 -->
			<div class="table-wrapper">
				<!-- 스크롤 영역 -->
				<div class="table-scroll">
					<table class="main-table">
					<thead>
						<tr>
							<th rowspan="2" class="th-grade">등급</th>
							<!-- 이번 달 -->
							{#if currentMonthData}
								<th colspan="4" class="th-month current-month">
									{currentMonthData.monthKey.split('-')[0]}년 {currentMonthData.monthKey.split('-')[1]}월
									<span class="text-xs font-normal">(조정가능)</span>
								</th>
							{/if}
							<!-- 기간총액 -->
							<th colspan="4" class="th-month period-total">
								이전기간({startMonth}~{endMonth})총액
							</th>
							<!-- 개별 월들 -->
							{#each monthsData as md}
								<th colspan="4" class="th-month">
									{md.monthKey.split('-')[0]}년 {md.monthKey.split('-')[1]}월
								</th>
							{/each}
						</tr>
						<tr>
							<!-- 이번 달 -->
							{#if currentMonthData}
								<th class="th-sub month-start">인원</th>
								<th class="th-sub">자동총액</th>
								<th class="th-sub editable">조정총액</th>
								<th class="th-sub">차이금액</th>
							{/if}
							<!-- 기간총액 -->
							<th class="th-sub month-start period-col">인원</th>
							<th class="th-sub period-col">자동총액</th>
							<th class="th-sub period-col">조정총액</th>
							<th class="th-sub period-col">차이금액</th>
							<!-- 개별 월들 -->
							{#each monthsData as md}
								<th class="th-sub month-start">인원</th>
								<th class="th-sub">자동총액</th>
								<th class="th-sub">조정총액</th>
								<th class="th-sub">차이금액</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'] as grade}
							<tr>
								<td class="td-grade">{grade}</td>
								<!-- 이번 달 -->
								{#if currentMonthData}
									{@const users = currentMonthData.gradeDistribution?.[grade] || 0}
									{@const auto = currentMonthData.gradePayments?.[grade] || 0}
									{@const manual = currentMonthData.adjustedGradePayments?.[grade]?.totalAmount}
									{@const display = adjustments[grade] ? Number(adjustments[grade]) : manual}
									{@const diff = (display !== null && display !== undefined) ? auto - display : 0}

									<td class="td-num month-start">{formatNum(users)}</td>
									<td class="td-amt">{formatNum(auto)}</td>
									<td class="td-adj editable">
										<input
											type="text"
											value={adjustments[grade] ? formatInputValue(adjustments[grade]) : ''}
											oninput={(e) => handleInput(grade, e.target.value)}
											onblur={() => handleBlur(grade)}
											class="adj-input"
										/>
									</td>
									<td class="td-diff" class:pos={diff > 0} class:neg={diff < 0}>
										{diff !== 0 ? formatNum(diff) : ''}
									</td>
								{/if}
								<!-- 기간총액 -->
								{#if true}
									{@const periodUsers = monthsData.reduce((s, md) => s + (md.gradeDistribution?.[grade] || 0), 0)}
									{@const periodAuto = monthsData.reduce((s, md) => s + (md.gradePayments?.[grade] || 0), 0)}
									{@const periodAdj = monthsData.reduce((s, md) => {
										const manual = md.adjustedGradePayments?.[grade]?.totalAmount;
										return s + (manual || 0);
									}, 0)}
									{@const hasAnyAdj = monthsData.some(md => md.adjustedGradePayments?.[grade]?.totalAmount !== null && md.adjustedGradePayments?.[grade]?.totalAmount !== undefined)}
									{@const periodDiff = hasAnyAdj ? periodAuto - periodAdj : 0}

									<td class="td-num month-start period-col">{formatNum(periodUsers)}</td>
									<td class="td-amt period-col">{formatNum(periodAuto)}</td>
									<td class="td-adj period-col">{hasAnyAdj ? formatNum(periodAdj) : ''}</td>
									<td class="td-diff period-col" class:pos={periodDiff > 0} class:neg={periodDiff < 0}>
										{periodDiff !== 0 ? formatNum(periodDiff) : ''}
									</td>
								{/if}
								<!-- 개별 월들 -->
								{#each monthsData as md}
									{@const users = md.gradeDistribution?.[grade] || 0}
									{@const auto = md.gradePayments?.[grade] || 0}
									{@const manual = md.adjustedGradePayments?.[grade]?.totalAmount}
									{@const diff = (manual !== null && manual !== undefined) ? auto - manual : 0}

									<td class="td-num month-start">{formatNum(users)}</td>
									<td class="td-amt">{formatNum(auto)}</td>
									<td class="td-adj">
										{manual !== null && manual !== undefined ? formatNum(manual) : ''}
									</td>
									<td class="td-diff" class:pos={diff > 0} class:neg={diff < 0}>
										{diff !== 0 ? formatNum(diff) : ''}
									</td>
								{/each}
							</tr>
						{/each}
						<!-- 총계 -->
						<tr class="total-row">
							<td class="td-grade">총계</td>
							<!-- 이번 달 -->
							{#if currentMonthData}
								{@const grades = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8']}
								{@const totalUsers = grades.reduce((s, g) => s + (currentMonthData.gradeDistribution?.[g] || 0), 0)}
								{@const totalAutoRaw = grades.reduce((s, g) => {
									const users = currentMonthData.gradeDistribution?.[g] || 0;
									const perPerson = currentMonthData.gradePayments?.[g] || 0;
									return s + (users * perPerson);
								}, 0)}
								{@const totalAuto = Math.floor(totalAutoRaw / 100) * 100}
								{@const totalAdjRaw = grades.reduce((s, g) => {
									const users = currentMonthData.gradeDistribution?.[g] || 0;
									const gradeAdj = adjustments[g] ? Number(adjustments[g]) : (currentMonthData.adjustedGradePayments?.[g]?.totalAmount || currentMonthData.gradePayments?.[g] || 0);
									return s + (users * gradeAdj);
								}, 0)}
								{@const totalAdj = Math.floor(totalAdjRaw / 100) * 100}
								{@const totalDiff = totalAuto - totalAdj}

								<td class="td-num month-start">{formatNum(totalUsers)}</td>
								<td class="td-amt">{formatNum(totalAuto)}</td>
								<td class="td-adj editable">{formatNum(totalAdj)}</td>
								<td class="td-diff" class:pos={totalDiff > 0} class:neg={totalDiff < 0}>
									{totalDiff !== 0 ? formatNum(totalDiff) : ''}
								</td>
							{/if}
							<!-- 기간총액 -->
							{#if true}
								{@const grades = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8']}
								{@const periodTotalUsers = monthsData.reduce((s, md) => s + grades.reduce((gs, g) => gs + (md.gradeDistribution?.[g] || 0), 0), 0)}
								{@const periodTotalAutoRaw = monthsData.reduce((s, md) => s + grades.reduce((gs, g) => {
									const users = md.gradeDistribution?.[g] || 0;
									const perPerson = md.gradePayments?.[g] || 0;
									return gs + (users * perPerson);
								}, 0), 0)}
								{@const periodTotalAuto = Math.floor(periodTotalAutoRaw / 100) * 100}
								{@const periodHasAdj = monthsData.some(md => grades.some(g => md.adjustedGradePayments?.[g]?.totalAmount !== null && md.adjustedGradePayments?.[g]?.totalAmount !== undefined))}
								{@const periodTotalAdjRaw = periodHasAdj ? monthsData.reduce((s, md) => s + grades.reduce((gs, g) => {
									const users = md.gradeDistribution?.[g] || 0;
									const perPerson = md.adjustedGradePayments?.[g]?.totalAmount || 0;
									return gs + (users * perPerson);
								}, 0), 0) : null}
								{@const periodTotalAdj = periodTotalAdjRaw !== null ? Math.floor(periodTotalAdjRaw / 100) * 100 : null}
								{@const periodTotalDiff = periodTotalAdj !== null ? periodTotalAuto - periodTotalAdj : 0}

								<td class="td-num month-start period-col">{formatNum(periodTotalUsers)}</td>
								<td class="td-amt period-col">{formatNum(periodTotalAuto)}</td>
								<td class="td-adj period-col">{periodTotalAdj !== null ? formatNum(periodTotalAdj) : ''}</td>
								<td class="td-diff period-col" class:pos={periodTotalDiff > 0} class:neg={periodTotalDiff < 0}>
									{periodTotalDiff !== 0 ? formatNum(periodTotalDiff) : ''}
								</td>
							{/if}
							<!-- 개별 월들 -->
							{#each monthsData as md}
								{@const grades = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8']}
								{@const totalUsers = grades.reduce((s, g) => s + (md.gradeDistribution?.[g] || 0), 0)}
								{@const totalAutoRaw = grades.reduce((s, g) => {
									const users = md.gradeDistribution?.[g] || 0;
									const perPerson = md.gradePayments?.[g] || 0;
									return s + (users * perPerson);
								}, 0)}
								{@const totalAuto = Math.floor(totalAutoRaw / 100) * 100}
								{@const hasAdj = grades.some(g => md.adjustedGradePayments?.[g]?.totalAmount !== null && md.adjustedGradePayments?.[g]?.totalAmount !== undefined)}
								{@const totalAdjRaw = hasAdj ? grades.reduce((s, g) => {
									const users = md.gradeDistribution?.[g] || 0;
									const perPerson = md.adjustedGradePayments?.[g]?.totalAmount || 0;
									return s + (users * perPerson);
								}, 0) : null}
								{@const totalAdj = totalAdjRaw !== null ? Math.floor(totalAdjRaw / 100) * 100 : null}
								{@const totalDiff = totalAdj !== null ? totalAuto - totalAdj : 0}

								<td class="td-num month-start">{formatNum(totalUsers)}</td>
								<td class="td-amt">{formatNum(totalAuto)}</td>
								<td class="td-adj">{totalAdj !== null ? formatNum(totalAdj) : ''}</td>
								<td class="td-diff" class:pos={totalDiff > 0} class:neg={totalDiff < 0}>
									{totalDiff !== 0 ? formatNum(totalDiff) : ''}
								</td>
							{/each}
						</tr>
					</tbody>
					</table>
				</div>
			</div>

			<!-- 참고사항 -->
			<div class="notice">
				<div class="notice-title">💡 참고사항</div>
				<div class="notice-text">
					• 이번달에 대해서만 지급총액을 조정할 수 있습니다<br />
					• 조정총액이 0이면 자동총액이 적용됩니다<br />
					• 저장 버튼을 눌러 변경된 조정금액으로 자동 계산이 됩니다
				</div>
			</div>
		{/if}
	</div>

	<svelte:fragment slot="footer">
		<button onclick={onClose} class="btn btn-cancel">취소</button>
		<button onclick={handleSave} class="btn btn-save">저장</button>
	</svelte:fragment>
</WindowsModal>

<style>
	.container {
		padding: 1rem;
	}

	.period-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1rem;
		flex-wrap: wrap;
	}

	.label {
		font-weight: 600;
		font-size: 0.875rem;
		color: #1f2937;
	}

	.period-buttons {
		display: flex;
		gap: 0.5rem;
	}

	.period-btn {
		padding: 0.375rem 0.75rem;
		border: 1px solid #cbd5e1;
		border-radius: 6px;
		background-color: white;
		color: #64748b;
		font-size: 0.8125rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}

	.period-btn:hover {
		background-color: #f8fafc;
		border-color: #3b82f6;
		color: #3b82f6;
	}

	.period-btn.active {
		background-color: #3b82f6;
		border-color: #3b82f6;
		color: white;
		font-weight: 600;
	}

	.period-display {
		font-size: 0.8125rem;
		color: #64748b;
		margin-left: auto;
	}

	.loading {
		padding: 2rem;
		text-align: center;
		color: #64748b;
	}

	.table-wrapper {
		position: relative;
		margin-bottom: 1rem;
	}

	.table-scroll {
		overflow-x: auto;
		overflow-y: visible;
	}

	.main-table {
		width: auto;
		min-width: 100%;
		border-collapse: separate;
		border-spacing: 0;
		font-size: 0.75rem;
	}

	.main-table thead {
		background-color: #f8fafc;
	}

	.th-grade {
		padding: 0.25rem;
		border: 1px solid #cbd5e1;
		font-weight: 700;
		text-align: center;
		min-width: 50px;
		width: 50px;
		background-color: #f8fafc;
		position: sticky;
		left: 0;
		z-index: 20 !important;
	}

	.th-month {
		padding: 0.25rem;
		border: 1px solid #cbd5e1;
		border-left: 2px solid #3b82f6;
		font-weight: 700;
		text-align: center;
		background-color: #dbeafe;
	}

	.th-month.current-month {
		background-color: #fef3c7;
	}

	.th-month.period-total {
		background-color: #d1fae5;
	}

	.th-sub {
		padding: 0.25rem;
		border: 1px solid #e2e8f0;
		font-weight: 600;
		text-align: center;
		min-width: 90px;
		white-space: nowrap;
	}

	.th-sub.month-start {
		border-left: 2px solid #3b82f6;
	}

	.th-sub.editable {
		background-color: #fef3c7;
	}

	.th-sub.period-col {
		background-color: #ecfdf5;
	}

	.td-grade {
		padding: 0.25rem;
		border: 1px solid #e2e8f0;
		font-weight: 700;
		text-align: center;
		background-color: white !important;
		position: sticky;
		left: 0;
		z-index: 10 !important;
	}

	.td-num {
		padding: 0.25rem;
		border: 1px solid #e2e8f0;
		text-align: center;
	}

	.td-num.month-start {
		border-left: 2px solid #3b82f6;
	}

	.td-amt {
		padding: 0.25rem;
		border: 1px solid #e2e8f0;
		text-align: right;
	}

	.td-adj {
		padding: 0.25rem;
		border: 1px solid #e2e8f0;
		text-align: right;
	}

	.td-adj.editable {
		background-color: #fef3c7;
		padding: 0.125rem;
	}

	.adj-input {
		width: 100%;
		padding: 0.125rem 0.25rem;
		border: 1px solid #cbd5e1;
		border-radius: 2px;
		text-align: right;
		font-size: 0.75rem;
		line-height: 1.2;
	}

	.adj-input:focus {
		outline: none;
		border-color: #f59e0b;
	}

	.adj-input::placeholder {
		color: #9ca3af;
		font-size: 0.6875rem;
	}

	.td-diff {
		padding: 0.25rem;
		border: 1px solid #e2e8f0;
		text-align: right;
		font-weight: 600;
	}

	.td-diff.pos {
		color: #dc2626;
	}

	.td-diff.neg {
		color: #2563eb;
	}

	.td-num.period-col,
	.td-amt.period-col,
	.td-adj.period-col,
	.td-diff.period-col {
		background-color: #f0fdf4;
		font-weight: 600;
	}

	.total-row {
		background-color: #f1f5f9;
		font-weight: 700;
	}

	.total-row .td-grade {
		background-color: #f1f5f9 !important;
	}

	.notice {
		background-color: #f0f9ff;
		border: 1px solid #bfdbfe;
		border-radius: 6px;
		padding: 0.75rem;
	}

	.notice-title {
		font-weight: 600;
		color: #1e40af;
		margin-bottom: 0.5rem;
		font-size: 0.875rem;
	}

	.notice-text {
		color: #1e40af;
		font-size: 0.75rem;
		line-height: 1.6;
	}

	.btn {
		padding: 0.5rem 1rem;
		font-size: 0.875rem;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.btn-cancel {
		color: #475569;
		background-color: white;
		border: 1px solid #e2e8f0;
	}

	.btn-cancel:hover {
		background-color: #f8fafc;
	}

	.btn-save {
		color: white;
		background-color: #3b82f6;
		border: 1px solid #3b82f6;
	}

	.btn-save:hover {
		background-color: #2563eb;
	}

	/* 모바일 최적화 */
	@media (max-width: 768px) {
		.container {
			padding: 0.5rem;
		}

		.period-row {
			flex-wrap: wrap;
			gap: 0.25rem;
		}

		.month-input {
			font-size: 0.8125rem;
			padding: 0.25rem 0.5rem;
		}

		.main-table {
			font-size: 0.8125rem;
		}

		.table-wrapper {
			margin-bottom: 0.5rem;
		}

		.notice {
			padding: 0.5rem;
		}

		.notice-title {
			font-size: 0.8125rem;
		}

		.notice-text {
			font-size: 0.8125rem;
		}

		.adj-input {
			font-size: 0.8125rem;
		}

		.adj-input::placeholder {
			font-size: 0.75rem;
		}
	}
</style>
