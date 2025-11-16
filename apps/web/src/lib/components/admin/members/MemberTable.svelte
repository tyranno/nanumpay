<script>
	import GradeBadge from '$lib/components/GradeBadge.svelte';

	export let members = [];
	export let isLoading = false;
	export let currentPage = 1;
	export let itemsPerPage = 20;
	export let sortBy = 'sequence';
	export let sortOrder = 'asc';
	export let visibleColumns = {};
	export let onSort = (field) => {};
	export let onEdit = (member) => {};
</script>

{#if isLoading}
	<div class="loading-state">데이터를 불러오는 중...</div>
{:else}
	<!-- 테이블 래퍼 -->
	<div class="table-wrapper">
		<table class="member-table">
			<thead>
				<tr>
					<th class="th-base">순번</th>
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
						<tr class="data-row">
							<td class="td-base">{(currentPage - 1) * itemsPerPage + index + 1}</td>
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
									{member.createdAt ? new Date(member.createdAt).toLocaleDateString('ko-KR') : '-'}
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

	/* 성명 컬럼 최소 너비 */
	.th-name {
		@apply min-w-[80px];
	}

	.td-name {
		@apply min-w-[80px];
	}

	/* 등급 아이콘 */
	.grade-icon {
		@apply absolute -right-5 -top-1.5 h-5 w-5;
	}
</style>
