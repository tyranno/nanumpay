<script>
	import WindowsModal from '$lib/components/WindowsModal.svelte';

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

	function handleSubmit() {
		// 판매인을 부모로 설정
		if (newMember.salesperson) {
			const parentUser = members.find(m => m.name === newMember.salesperson);
			if (parentUser) {
				newMember.parentId = parentUser._id;
			}
		}
		onSubmit(newMember);
	}
</script>

<WindowsModal
	{isOpen}
	title="용역자 등록"
	icon="/icons/user-plus.svg"
	size="lg"
	{onClose}
>
	<div class="grid grid-cols-2 gap-4">
		<!-- 왼쪽: 사용자 기본 정보 -->
		<div class="space-y-3">
			<h4 class="text-sm font-semibold text-gray-900 border-b pb-1">기본 정보</h4>
			<div>
				<label class="block text-xs font-medium text-gray-700">성명 *</label>
				<input
					type="text"
					bind:value={newMember.name}
					class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
				/>
				<p class="text-xs text-gray-500 mt-0.5">※ ID 자동 생성</p>
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
					<label class="block text-xs font-medium text-gray-700">판매인</label>
					<input
						type="text"
						bind:value={newMember.salesperson}
						class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
					/>
					<p class="text-xs text-gray-500 mt-0.5">※ 계층도 부모</p>
				</div>
				<div>
					<label class="block text-xs font-medium text-gray-700">판매인 연락처</label>
					<input
						type="text"
						bind:value={newMember.salespersonPhone}
						class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
					/>
				</div>
			</div>
			<div class="grid grid-cols-2 gap-2">
				<div>
					<label class="block text-xs font-medium text-gray-700">설계사</label>
					<input
						type="text"
						bind:value={newMember.planner}
						class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
					/>
				</div>
				<div>
					<label class="block text-xs font-medium text-gray-700">설계사 연락처</label>
					<input
						type="text"
						bind:value={newMember.plannerPhone}
						class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
					/>
				</div>
			</div>
			<div>
				<label class="block text-xs font-medium text-gray-700">소속/지사</label>
				<input
					type="text"
					bind:value={newMember.branch}
					class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
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
