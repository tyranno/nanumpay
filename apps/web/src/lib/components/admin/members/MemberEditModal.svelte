<script>
	import WindowsModal from '$lib/components/WindowsModal.svelte';
	import Autocomplete from '$lib/components/Autocomplete.svelte';

	export let isOpen = false;
	export let member = null;
	export let onClose = () => {};
	export let onSubmit = (memberData) => {};

	// 판매인 선택 핸들러
	function handleSalespersonSelect(user) {
		member.salesperson = user.name;
		member.salespersonPhone = user.phone || '';
		member.parentId = user._id;
	}

	// 설계사 선택 핸들러
	function handlePlannerSelect(planner) {
		member.planner = planner.name;
		member.plannerPhone = planner.phone || '';
	}

	// 판매인 이름 변경 시 자동으로 연락처 추출
	async function handleSalespersonNameChange(event) {
		const name = event.target.value.trim();
		if (!name) {
			member.salespersonPhone = '';
			member.parentId = '';
			return;
		}

		try {
			const response = await fetch(`/api/admin/users/search?q=${encodeURIComponent(name)}`);
			const data = await response.json();

			// 정확히 일치하는 이름 찾기
			const exactMatch = data.users?.find(u => u.name === name);
			if (exactMatch) {
				member.salespersonPhone = exactMatch.phone || '';
				member.parentId = exactMatch._id;
			}
		} catch (error) {
			console.error('Failed to fetch salesperson data:', error);
		}
	}

	// 설계사 이름 변경 시 자동으로 연락처 추출
	async function handlePlannerNameChange(event) {
		const name = event.target.value.trim();
		if (!name) {
			member.plannerPhone = '';
			return;
		}

		try {
			const response = await fetch(`/api/planners/search?q=${encodeURIComponent(name)}`);
			const data = await response.json();

			// 정확히 일치하는 이름 찾기
			const exactMatch = data.planners?.find(p => p.name === name);
			if (exactMatch) {
				member.plannerPhone = exactMatch.phone || '';
			}
		} catch (error) {
			console.error('Failed to fetch planner data:', error);
		}
	}

	// 소속/지사 선택 핸들러
	function handleBranchSelect(branch) {
		member.branch = branch.name;
	}
</script>

<WindowsModal
	isOpen={isOpen && member}
	title="회원 정보 수정"
	icon="/icons/edit-blue.svg"
	size="lg"
	{onClose}
>
	{#if member}
		<div class="grid grid-cols-2 gap-4">
			<!-- 왼쪽: 사용자 기본 정보 -->
			<div class="space-y-3">
				<h4 class="text-xs font-semibold text-gray-900 border-b pb-1.5">기본 정보</h4>

				<div>
					<label class="block text-xs font-medium text-gray-700 mb-0.5">성명</label>
					<input
						type="text"
						bind:value={member.name}
						class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
					/>
				</div>

				<div>
					<label class="block text-xs font-medium text-gray-700 mb-0.5">연락처</label>
					<input
						type="text"
						bind:value={member.phone}
						class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
					/>
				</div>

				<div>
					<label class="block text-xs font-medium text-gray-700 mb-0.5">주민번호</label>
					<input
						type="text"
						bind:value={member.idNumber}
						class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
					/>
				</div>

				<div>
					<label class="block text-xs font-medium text-gray-700 mb-0.5">은행</label>
					<input
						type="text"
						bind:value={member.bank}
						class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
					/>
				</div>

				<div>
					<label class="block text-xs font-medium text-gray-700 mb-0.5">계좌번호</label>
					<input
						type="text"
						bind:value={member.accountNumber}
						class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
					/>
				</div>
				<div>
					<label class="block text-xs font-medium text-gray-700 mb-0.5">보험상품명</label>
					<input
						type="text"
						bind:value={member.insuranceProduct}
						class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
					/>
				</div>
				<div>
					<label class="block text-xs font-medium text-gray-700 mb-0.5">보험회사</label>
					<input
						type="text"
						bind:value={member.insuranceCompany}
						class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
					/>
				</div>
			</div>

			<!-- 오른쪽: 판매인/설계사 정보 -->
			<div class="space-y-3">
				<h4 class="text-xs font-semibold text-gray-900 border-b pb-1.5">판매/설계 정보</h4>

				<div class="grid grid-cols-2 gap-3">
					<div>
						<Autocomplete
							label="판매인"
							bind:value={member.salesperson}
							placeholder="판매인 이름 검색..."
							apiUrl="/api/admin/users/search"
							displayKey="name"
							subtextKey="phone"
							onSelect={handleSalespersonSelect}
							onInputChange={handleSalespersonNameChange}
						/>
					</div>
					<div>
						<label class="block text-xs font-medium text-gray-700 mb-0.5">판매인 연락처</label>
						<input
							type="text"
							bind:value={member.salespersonPhone}
							class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
							readonly
						/>
					</div>
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div>
						<Autocomplete
							label="설계사"
							bind:value={member.planner}
							placeholder="설계사 이름 검색..."
							apiUrl="/api/planners/search"
							displayKey="name"
							subtextKey="phone"
							onSelect={handlePlannerSelect}
							onInputChange={handlePlannerNameChange}
						/>
					</div>
					<div>
						<label class="block text-xs font-medium text-gray-700 mb-0.5">설계사 연락처</label>
						<input
							type="text"
							bind:value={member.plannerPhone}
							class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
							readonly
						/>
					</div>
				</div>

				<div>
					<Autocomplete
						label="소속/지사"
						bind:value={member.branch}
						placeholder="소속/지사 검색..."
						apiUrl="/api/branches/search"
						displayKey="name"
						onSelect={handleBranchSelect}
					/>
				</div>

				<div>
					<label class="block text-xs font-medium text-gray-700 mb-0.5">산하정보 보기 권한</label>
					<label class="flex items-center cursor-pointer mt-1.5">
						<input
							type="checkbox"
							bind:checked={member.canViewSubordinates}
							class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
						/>
						<span class="ml-2 text-sm text-gray-700">산하정보 조회 허용</span>
					</label>
				</div>
			</div>
		</div>
	{/if}

	<svelte:fragment slot="footer">
		<button
			onclick={onClose}
			class="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
		>
			취소
		</button>
		<button
			onclick={() => onSubmit(member)}
			class="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
		>
			수정
		</button>
	</svelte:fragment>
</WindowsModal>
