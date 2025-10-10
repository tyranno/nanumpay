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
	export let onDelete = (member) => {};
</script>

<div class="bg-white rounded-lg shadow overflow-hidden">
	<!-- 모바일에서 가로 스크롤 가능 -->
	<div class="overflow-x-auto">
		<table class="divide-y divide-gray-200" style="min-width: 1000px;">
			<thead class="bg-gray-50">
				<tr>
					<th class="sticky left-0 z-20 bg-gray-50 px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap" style="width: 50px; min-width: 50px; max-width: 50px;">
						순번
					</th>
					{#if visibleColumns.name}
						<th onclick={() => onSort('name')} class="sticky left-[50px] z-20 bg-gray-50 px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 whitespace-nowrap" style="width: 90px; min-width: 90px;">
							성명 {#if sortBy === 'name'}{sortOrder === 'asc' ? '↑' : '↓'}{/if}
						</th>
					{/if}
					{#if visibleColumns.date}
						<th onclick={() => onSort('createdAt')} class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 whitespace-nowrap" style="min-width: 100px;">
							등록일 {#if sortBy === 'createdAt'}{sortOrder === 'asc' ? '↑' : '↓'}{/if}
						</th>
					{/if}
					{#if visibleColumns.phone}
						<th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap" style="min-width: 120px;">
							연락처
						</th>
					{/if}
					{#if visibleColumns.salesperson}
						<th onclick={() => onSort('salesperson')} class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 whitespace-nowrap" style="min-width: 80px;">
							판매인 {#if sortBy === 'salesperson'}{sortOrder === 'asc' ? '↑' : '↓'}{/if}
						</th>
					{/if}
					{#if visibleColumns.planner}
						<th onclick={() => onSort('planner')} class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 whitespace-nowrap" style="min-width: 80px;">
							설계사 {#if sortBy === 'planner'}{sortOrder === 'asc' ? '↑' : '↓'}{/if}
						</th>
					{/if}
					{#if visibleColumns.branch}
						<th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap" style="min-width: 80px;">
							지사
						</th>
					{/if}
					{#if visibleColumns.idNumber}
						<th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap" style="min-width: 140px;">
							주민번호
						</th>
					{/if}
					{#if visibleColumns.bank}
						<th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap" style="min-width: 80px;">
							은행
						</th>
					{/if}
					{#if visibleColumns.accountNumber}
						<th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap" style="min-width: 140px;">
							계좌번호
						</th>
					{/if}
					{#if visibleColumns.plannerPhone}
						<th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap" style="min-width: 110px;">
							설계사 연락처
						</th>
					{/if}
					{#if visibleColumns.insuranceProduct}
						<th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap" style="min-width: 120px;">
							보험상품
						</th>
					{/if}
					{#if visibleColumns.insuranceCompany}
						<th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap" style="min-width: 80px;">
							보험회사
						</th>
					{/if}
					<th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap" style="min-width: 60px; width: 60px;">
						작업
					</th>
				</tr>
			</thead>
			<tbody class="bg-white divide-y divide-gray-200">
				{#if isLoading}
					<tr>
						<td colspan="12" class="text-center py-8 text-gray-500">
							로딩 중...
						</td>
					</tr>
				{:else if members.length === 0}
					<tr>
						<td colspan="12" class="text-left px-3 py-8 text-gray-500">
							등록된 용역자가 없습니다.
						</td>
					</tr>
				{:else}
					{#each members as member, index}
						<tr class="group hover:bg-gray-50">
							<td class="sticky left-0 z-10 bg-white group-hover:bg-gray-50 px-2 py-2 text-sm text-gray-700 text-center whitespace-nowrap" style="width: 50px; min-width: 50px; max-width: 50px;">
								{(currentPage - 1) * itemsPerPage + index + 1}
							</td>
							{#if visibleColumns.name}
							<td class="sticky left-[50px] z-10 bg-white group-hover:bg-gray-50 px-3 py-2 text-sm font-medium text-gray-900 whitespace-nowrap" style="width: 90px; min-width: 90px;">
								<div class="relative inline-flex items-baseline">
										{member.name}
										{#if member.grade}
											<img src="/icons/{member.grade}.svg" alt="{member.grade}" class="w-4 h-4 absolute -top-1 -right-4" title="{member.grade} 등급" />
										{/if}
									</div>
							</td>
						{/if}
							{#if visibleColumns.date}
								<td class="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">
									{member.createdAt ? new Date(member.createdAt).toLocaleDateString('ko-KR') : '-'}
								</td>
							{/if}
							{#if visibleColumns.phone}
								<td class="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">
									{member.phone || '-'}
								</td>
							{/if}
							{#if visibleColumns.salesperson}
								<td class="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">
									{member.salesperson || '-'}
								</td>
							{/if}
							{#if visibleColumns.planner}
								<td class="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">
									{member.planner || '-'}
								</td>
							{/if}
							{#if visibleColumns.branch}
								<td class="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">
									{member.branch || '-'}
								</td>
							{/if}
							{#if visibleColumns.idNumber}
								<td class="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">
									{member.idNumber || '-'}
								</td>
							{/if}
							{#if visibleColumns.bank}
								<td class="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">
									{member.bank || '-'}
								</td>
							{/if}
							{#if visibleColumns.accountNumber}
								<td class="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">
									{member.accountNumber || '-'}
								</td>
							{/if}
							{#if visibleColumns.plannerPhone}
								<td class="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">
									{member.plannerPhone || '-'}
								</td>
							{/if}
							{#if visibleColumns.insuranceProduct}
								<td class="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">
									{member.insuranceProduct || '-'}
								</td>
							{/if}
							{#if visibleColumns.insuranceCompany}
								<td class="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">
									{member.insuranceCompany || '-'}
								</td>
							{/if}
							<td class="px-1 py-2 whitespace-nowrap">
								<div class="flex gap-0.5">
									<button
										onclick={() => onEdit(member)}
										class="p-0.5 hover:bg-blue-50 rounded transition-colors"
										title="수정"
									>
										<img src="/icons/edit-blue.svg" alt="Edit" class="w-4 h-4" />
									</button>
									<button
										onclick={() => onDelete(member)}
										class="p-0.5 hover:bg-red-50 rounded transition-colors"
										title="삭제"
									>
										<img src="/icons/trash-red.svg" alt="Delete" class="w-4 h-4" />
									</button>
								</div>
							</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>
</div>
