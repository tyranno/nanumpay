<script>
	import WindowsModal from '$lib/components/WindowsModal.svelte';
	import Autocomplete from '$lib/components/Autocomplete.svelte';

	export let isOpen = false;
	export let members = [];
	export let onClose = () => {};
	export let onSubmit = (memberData) => {};

	let newMember = {
		name: '',
		loginId: '',
		phone: '',
		idNumber: '',
		bank: '',
		accountNumber: '',
		branch: '',
		parentId: '',
		position: 'L',
		salesperson: '',
		salespersonPhone: '',
		planner: '',
		plannerPhone: '',
		insuranceProduct: '',
		insuranceCompany: '',
		registrationDate: new Date().toISOString().split('T')[0]
	};

	export function resetForm() {
		newMember = {
			name: '',
			loginId: '',
			phone: '',
			idNumber: '',
			bank: '',
			accountNumber: '',
			branch: '',
			parentId: '',
			position: 'L',
			salesperson: '',
			salespersonPhone: '',
			planner: '',
			plannerPhone: '',
			insuranceProduct: '',
			insuranceCompany: '',
			registrationDate: new Date().toISOString().split('T')[0]
		};
	}

	// 판매인 선택 핸들러
	function handleSalespersonSelect(user) {
		newMember.salesperson = user.name;
		newMember.salespersonPhone = user.phone || '';
		newMember.parentId = user._id;
	}

	// 설계사 선택 핸들러
	function handlePlannerSelect(planner) {
		newMember.planner = planner.name;
		newMember.plannerPhone = planner.phone || '';
	}

	// 판매인 이름 변경 시 자동으로 연락처 추출
	async function handleSalespersonNameChange(event) {
		const name = event.target.value.trim();
		if (!name) {
			newMember.salespersonPhone = '';
			newMember.parentId = '';
			return;
		}

		try {
			const response = await fetch(`/api/admin/users/search?q=${encodeURIComponent(name)}`);
			const data = await response.json();

			// 정확히 일치하는 이름 찾기
			const exactMatch = data.users?.find(u => u.name === name);
			if (exactMatch) {
				newMember.salespersonPhone = exactMatch.phone || '';
				newMember.parentId = exactMatch._id;
			}
		} catch (error) {
			console.error('Failed to fetch salesperson data:', error);
		}
	}

	// 설계사 이름 변경 시 자동으로 연락처 추출
	async function handlePlannerNameChange(event) {
		const name = event.target.value.trim();
		if (!name) {
			newMember.plannerPhone = '';
			return;
		}

		try {
			const response = await fetch(`/api/planners/search?q=${encodeURIComponent(name)}`);
			const data = await response.json();

			// 정확히 일치하는 이름 찾기
			const exactMatch = data.planners?.find(p => p.name === name);
			if (exactMatch) {
				newMember.plannerPhone = exactMatch.phone || '';
			}
		} catch (error) {
			console.error('Failed to fetch planner data:', error);
		}
	}

	// 소속/지사 선택 핸들러
	function handleBranchSelect(branch) {
		newMember.branch = branch.name;
	}

	function handleSubmit() {
		onSubmit(newMember);
	}
</script>

<WindowsModal
	{isOpen}
	title="지원자 등록"
	icon="/icons/user-plus.svg"
	size="xl"
	{onClose}
>
	<div class="grid grid-cols-2 gap-4">
		<!-- 왼쪽: 사용자 기본 정보 -->
		<div class="space-y-3">
			<h4 class="text-sm font-semibold text-gray-900 border-b pb-1">기본 정보</h4>
			<div class="grid grid-cols-2 gap-2">
				<div>
					<label class="block text-xs font-medium text-gray-700">ID *</label>
					<input
						type="text"
						bind:value={newMember.loginId}
						class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
						placeholder="홍길동"
					/>
					<p class="text-xs text-gray-500 mt-0.5">※ 같은 성명 계약정보 구분</p>
				</div>
				<div>
					<label class="block text-xs font-medium text-gray-700">성명 *</label>
					<input
						type="text"
						bind:value={newMember.name}
						class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
					/>
				</div>
			</div>
			<div>
				<label class="block text-xs font-medium text-gray-700">연락처 *</label>
				<input
					type="text"
					bind:value={newMember.phone}
					class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
					placeholder="010-1234-5678"
				/>
				<p class="text-xs text-gray-500 mt-0.5">※ 뒤 4자리가 초기 암호</p>
			</div>
			<div class="grid grid-cols-2 gap-2">
				<div>
					<label class="block text-xs font-medium text-gray-700">주민번호</label>
					<input
						type="text"
						bind:value={newMember.idNumber}
						class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
						placeholder="000000-0000000"
					/>
				</div>
				<div>
					<label class="block text-xs font-medium text-gray-700">등록날짜</label>
					<input
						type="date"
						bind:value={newMember.registrationDate}
						class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
					/>
				</div>
			</div>
			<div class="grid grid-cols-2 gap-2">
				<div>
					<label class="block text-xs font-medium text-gray-700">은행</label>
					<input
						type="text"
						bind:value={newMember.bank}
						class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
					/>
				</div>
				<div>
					<label class="block text-xs font-medium text-gray-700">계좌번호</label>
					<input
						type="text"
						bind:value={newMember.accountNumber}
						class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
					/>
				</div>
			</div>
			<div class="grid grid-cols-2 gap-2">
				<div>
					<label class="block text-xs font-medium text-gray-700">보험상품</label>
					<input
						type="text"
						bind:value={newMember.insuranceProduct}
						class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
					/>
				</div>
				<div>
					<label class="block text-xs font-medium text-gray-700">보험회사</label>
					<input
						type="text"
						bind:value={newMember.insuranceCompany}
						class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
					/>
				</div>
			</div>
		</div>

		<!-- 오른쪽: 판매인/설계사 정보 -->
		<div class="space-y-3">
			<h4 class="text-sm font-semibold text-gray-900 border-b pb-1">판매/설계 정보</h4>
			<div class="grid grid-cols-2 gap-2">
				<div>
					<label class="block text-xs font-medium text-gray-700 mb-1">
						판매인 <span class="text-red-500">*</span>
					</label>
					<Autocomplete
						bind:value={newMember.salesperson}
						placeholder="판매인 이름 검색..."
						apiUrl="/api/admin/users/search"
						displayKey="name"
						subtextKey="phone"
						onSelect={handleSalespersonSelect}
						onInputChange={handleSalespersonNameChange}
						required
					/>
					<p class="text-xs text-gray-500 mt-0.5">※ 계층도 부모</p>
				</div>
				<div>
					<label class="block text-xs font-medium text-gray-700 mb-1">판매인 연락처</label>
					<input
						type="text"
						bind:value={newMember.salespersonPhone}
						class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
						readonly
					/>
				</div>
			</div>
			<div class="grid grid-cols-2 gap-2">
				<div>
					<label class="block text-xs font-medium text-gray-700 mb-1">
						설계사 <span class="text-red-500">*</span>
					</label>
					<Autocomplete
						bind:value={newMember.planner}
						placeholder="설계사 이름 검색..."
						apiUrl="/api/planners/search"
						displayKey="name"
						subtextKey="phone"
						onSelect={handlePlannerSelect}
						onInputChange={handlePlannerNameChange}
						required
					/>
				</div>
				<div>
					<label class="block text-xs font-medium text-gray-700 mb-1">설계사 연락처</label>
					<input
						type="text"
						bind:value={newMember.plannerPhone}
						class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
						readonly
					/>
				</div>
			</div>
			<div>
				<Autocomplete
					label="소속/지사"
					bind:value={newMember.branch}
					placeholder="소속/지사 검색..."
					apiUrl="/api/branches/search"
					displayKey="name"
					onSelect={handleBranchSelect}
					inputClass="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
				/>
			</div>
		</div>
	</div>

	<svelte:fragment slot="footer">
		<button
			onclick={onClose}
			class="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
		>
			취소
		</button>
		<button
			onclick={handleSubmit}
			class="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
		>
			등록
		</button>
	</svelte:fragment>
</WindowsModal>
