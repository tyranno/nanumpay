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
		ratio: 1,
		bank: '',
		accountNumber: '',
		branch: '',
		parentId: '',
		position: 'L',
		salesperson: '',
		salespersonPhone: '',
		planner: '',
		plannerPhone: '',
		plannerBank: '',
		plannerAccountNumber: '',
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
			ratio: 1,
			bank: '',
			accountNumber: '',
			branch: '',
			parentId: '',
			position: 'L',
			salesperson: '',
			salespersonPhone: '',
			planner: '',
			plannerPhone: '',
			plannerBank: '',
			plannerAccountNumber: '',
			insuranceProduct: '',
			insuranceCompany: '',
			registrationDate: new Date().toISOString().split('T')[0]
		};
		nameDuplicateWarning = '';
	}

	let nameDuplicateWarning = '';

	// ID(계정) 선택 핸들러 - 기존 계정 선택 시 개인정보 자동 채움
	function handleAccountSelect(account) {
		newMember = {
			...newMember,
			loginId: account.loginId,
			name: account.loginId, // 성명도 ID와 동일하게 설정
			phone: account.phone || '',
			idNumber: account.idNumber || '',
			bank: account.bank || '',
			accountNumber: account.accountNumber || ''
		};
		checkNameDuplicate(account.loginId);
	}

	// ID 입력 변경 시 성명도 동일하게 설정 + 기존 계정 정보 자동 채움
	let idCheckTimer;
	function handleIdInputChange(event) {
		const id = event.target.value.trim();
		// 성명도 동일하게 설정
		newMember = { ...newMember, name: id };
		checkNameDuplicate(id);

		clearTimeout(idCheckTimer);
		if (!id) return;

		idCheckTimer = setTimeout(async () => {
			try {
				const res = await fetch(`/api/admin/useraccounts/search?q=${encodeURIComponent(id)}`);
				const data = await res.json();
				const exact = data.accounts?.find(a => a.loginId === id);
				if (exact) {
					newMember = {
						...newMember,
						phone: exact.phone || '',
						idNumber: exact.idNumber || '',
						bank: exact.bank || '',
						accountNumber: exact.accountNumber || ''
					};
				}
			} catch (e) {
				console.error('ID lookup error:', e);
			}
		}, 300);
	}

	// 성명 중복 검사 (User 테이블 기준)
	let nameCheckTimer;
	async function checkNameDuplicate(name) {
		clearTimeout(nameCheckTimer);
		if (!name) {
			nameDuplicateWarning = '';
			return;
		}
		nameCheckTimer = setTimeout(async () => {
			try {
				const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(name)}`);
				const data = await res.json();
				const exact = data.users?.find(u => u.name === name);
				nameDuplicateWarning = exact ? `"${name}" 동명 존재` : '';
			} catch (e) {
				nameDuplicateWarning = '';
			}
		}, 300);
	}

	// 성명 직접 입력 시 중복 검사
	function handleNameInput(event) {
		const name = event.target.value;
		newMember = { ...newMember, name };
		checkNameDuplicate(name);
	}

	// 판매인 선택 핸들러
	function handleSalespersonSelect(user) {
		newMember = {
			...newMember,
			salesperson: user.name,
			salespersonPhone: user.phone || '',
			parentId: user._id
		};
	}

	// 설계사 선택 핸들러
	function handlePlannerSelect(planner) {
		newMember = {
			...newMember,
			planner: planner.name,
			plannerPhone: planner.phone || '',
			plannerBank: planner.bank || '',
			plannerAccountNumber: planner.accountNumber || ''
		};
	}

	// 판매인 이름 변경 시 자동으로 연락처 추출
	async function handleSalespersonNameChange(event) {
		const name = event.target.value.trim();
		if (!name) {
			newMember = { ...newMember, salespersonPhone: '', parentId: '' };
			return;
		}

		try {
			const response = await fetch(`/api/admin/users/search?q=${encodeURIComponent(name)}`);
			const data = await response.json();

			// 정확히 일치하는 이름 찾기
			const exactMatch = data.users?.find(u => u.name === name);
			if (exactMatch) {
				newMember = {
					...newMember,
					salespersonPhone: exactMatch.phone || '',
					parentId: exactMatch._id
				};
			}
		} catch (error) {
			console.error('Failed to fetch salesperson data:', error);
		}
	}

	// 설계사 이름 변경 시 자동으로 연락처 추출
	async function handlePlannerNameChange(event) {
		const name = event.target.value.trim();
		if (!name) {
			newMember = { ...newMember, plannerPhone: '' };
			return;
		}

		try {
			const response = await fetch(`/api/planners/search?q=${encodeURIComponent(name)}`);
			const data = await response.json();

			// 정확히 일치하는 이름 찾기
			const exactMatch = data.planners?.find(p => p.name === name);
			if (exactMatch) {
				newMember = { ...newMember, plannerPhone: exactMatch.phone || '' };
			}
		} catch (error) {
			console.error('Failed to fetch planner data:', error);
		}
	}

	// 소속/지사 선택 핸들러
	function handleBranchSelect(branch) {
		newMember = { ...newMember, branch: branch.name };
	}

	// 전화번호 포맷팅 (010-1234-5678)
	function formatPhone(value) {
		const numbers = value.replace(/[^0-9]/g, '');
		if (numbers.length <= 3) return numbers;
		if (numbers.length <= 7) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
		return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7, 11)}`;
	}

	// 주민번호 포맷팅 (000000-0000000)
	function formatIdNumber(value) {
		const numbers = value.replace(/[^0-9]/g, '');
		if (numbers.length <= 6) return numbers;
		return `${numbers.slice(0, 6)}-${numbers.slice(6, 13)}`;
	}

	// 전화번호 입력 핸들러
	function handlePhoneInput(field) {
		return (e) => {
			const formatted = formatPhone(e.target.value);
			newMember = { ...newMember, [field]: formatted };
		};
	}

	// 주민번호 입력 핸들러
	function handleIdNumberInput(e) {
		const formatted = formatIdNumber(e.target.value);
		newMember = { ...newMember, idNumber: formatted };
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
					<Autocomplete
						bind:value={newMember.loginId}
						placeholder="ID 입력..."
						apiUrl="/api/admin/useraccounts/search"
						responseKey="accounts"
						displayKey="loginId"
						onSelect={handleAccountSelect}
						onInputChange={handleIdInputChange}
					/>
					<p class="text-xs text-gray-500 mt-0.5">※ 기존 계정 선택 시 자동 입력</p>
				</div>
				<div>
					<label class="block text-xs font-medium text-gray-700">성명 *</label>
					<input
						type="text"
						value={newMember.name}
						oninput={handleNameInput}
						class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md {nameDuplicateWarning ? 'border-orange-400' : ''}"
					/>
					{#if nameDuplicateWarning}
						<p class="text-xs text-orange-500 mt-0.5">※ {nameDuplicateWarning}</p>
					{/if}
				</div>
			</div>
			<div class="grid grid-cols-2 gap-2">
				<div>
					<label class="block text-xs font-medium text-gray-700">연락처 *</label>
					<input
						type="text"
						value={newMember.phone}
						oninput={handlePhoneInput('phone')}
						class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
						placeholder="010-1234-5678"
					/>
					<p class="text-xs text-gray-500 mt-0.5">※ 뒤 4자리가 초기 암호</p>
				</div>
				<div>
					<label class="block text-xs font-medium text-gray-700">주민번호</label>
					<input
						type="text"
						value={newMember.idNumber}
						oninput={handleIdNumberInput}
						class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
						placeholder="000000-0000000"
					/>
				</div>
			</div>
			<div class="grid grid-cols-2 gap-2">
				<div>
					<label class="block text-xs font-medium text-gray-700">등록날짜</label>
					<input
						type="date"
						bind:value={newMember.registrationDate}
						class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
					/>
				</div>
				<div>
					<label class="block text-xs font-medium text-gray-700">비율</label>
					<select
						bind:value={newMember.ratio}
						class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
					>
						<option value={1}>1</option>
						<option value={0.75}>0.75</option>
						<option value={0.5}>0.5</option>
						<option value={0.25}>0.25</option>
					</select>
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
			<!-- Row 1: 판매인 (왼쪽 ID/성명과 정렬) -->
			<div class="grid grid-cols-2 gap-2">
				<div>
					<label class="block text-xs font-medium text-gray-700">
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
					<label class="block text-xs font-medium text-gray-700">판매인 연락처</label>
					<input
						type="text"
						value={newMember.salespersonPhone}
						oninput={handlePhoneInput('salespersonPhone')}
						class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
					/>
				</div>
			</div>
			<!-- Row 2: 설계사 (왼쪽 연락처/주민번호와 정렬) -->
			<div class="grid grid-cols-2 gap-2">
				<div>
					<label class="block text-xs font-medium text-gray-700">
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
					<p class="text-xs text-gray-500 mt-0.5 invisible">※</p>
				</div>
				<div>
					<label class="block text-xs font-medium text-gray-700">설계사 연락처</label>
					<input
						type="text"
						value={newMember.plannerPhone}
						oninput={handlePhoneInput('plannerPhone')}
						class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
					/>
				</div>
			</div>
			<!-- Row 3: 설계사 은행/계좌 (왼쪽 등록날짜/비율과 정렬) -->
			<div class="grid grid-cols-2 gap-2">
				<div>
					<label class="block text-xs font-medium text-gray-700">설계사 은행</label>
					<input
						type="text"
						bind:value={newMember.plannerBank}
						class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
					/>
				</div>
				<div>
					<label class="block text-xs font-medium text-gray-700">설계사 계좌번호</label>
					<input
						type="text"
						bind:value={newMember.plannerAccountNumber}
						class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
					/>
				</div>
			</div>
			<!-- Row 4: 소속/지사 (왼쪽 은행/계좌번호와 정렬) -->
			<div class="grid grid-cols-2 gap-2">
				<div class="col-span-2">
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
			<!-- Row 5: 빈 공간 (왼쪽 보험상품/보험회사와 정렬) -->
			<div class="h-[52px]"></div>
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
