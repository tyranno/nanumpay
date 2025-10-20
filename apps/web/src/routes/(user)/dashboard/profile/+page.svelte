<script>
	import { onMount } from 'svelte';
	import WindowsModal from '$lib/components/WindowsModal.svelte';

	let userInfo = {
		name: '',
		loginId: '',
		phone: '',
		bank: '',
		accountNumber: '',
		idNumber: '',
		insuranceCompany: '',
		insuranceProduct: '',
		branch: '',
		planner: '',
		plannerPhone: '',
		salesperson: '',
		salespersonPhone: '',
		grade: '',
		insuranceActive: false
	};

	let editMode = false;
	let isLoading = true;
	let error = null;
	let saveMessage = '';

	// 편집 모드 진입용 패스워드 확인
	let showPasswordPrompt = false;
	let verifyPassword = '';
	let verifyError = '';

	// 패스워드 변경 관련
	let passwordData = {
		currentPasswordForChange: '',
		newPassword: '',
		confirmPassword: ''
	};
	let passwordError = '';

	onMount(async () => {
		try {
			const response = await fetch('/api/user/profile');
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.message || '정보를 불러오는데 실패했습니다.');
			}

			if (data.success) {
				userInfo = data.profile;
			} else {
				throw new Error('정보가 없습니다.');
			}
		} catch (err) {
			console.error('❌ Error loading profile:', err);
			error = err.message;
		} finally {
			isLoading = false;
		}
	});

	function toggleEdit() {
		if (!editMode) {
			// 편집 모드 진입 시도 - 패스워드 확인 프롬프트 표시
			showPasswordPrompt = true;
			verifyPassword = '';
			verifyError = '';
		} else {
			// 편집 취소
			editMode = false;
			saveMessage = '';
			passwordError = '';
			passwordData = {
				currentPasswordForChange: '',
				newPassword: '',
				confirmPassword: ''
			};
		}
	}

	async function verifyPasswordAndEnterEdit() {
		if (!verifyPassword) {
			verifyError = '비밀번호를 입력해주세요.';
			return;
		}

		try {
			// 비밀번호 확인 API 호출
			const response = await fetch('/api/user/verify-password', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ password: verifyPassword })
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.message || '비밀번호 확인에 실패했습니다.');
			}

			// 비밀번호 확인 성공 - 편집 모드 진입
			showPasswordPrompt = false;
			editMode = true;
			verifyPassword = '';
			verifyError = '';
		} catch (err) {
			console.error('❌ Error verifying password:', err);
			verifyError = err.message;
		}
	}

	function cancelPasswordPrompt() {
		showPasswordPrompt = false;
		verifyPassword = '';
		verifyError = '';
	}

	async function saveInfo() {
		passwordError = '';

		// 비밀번호 변경 유효성 검사
		if (passwordData.currentPasswordForChange || passwordData.newPassword || passwordData.confirmPassword) {
			// 하나라도 입력되었으면 모두 입력되어야 함
			if (!passwordData.currentPasswordForChange || !passwordData.newPassword || !passwordData.confirmPassword) {
				passwordError = '비밀번호 변경 시 모든 필드를 입력해주세요.';
				return;
			}

			// 새 비밀번호와 확인 비밀번호 일치 여부
			if (passwordData.newPassword !== passwordData.confirmPassword) {
				passwordError = '새 비밀번호가 일치하지 않습니다.';
				return;
			}

			// 비밀번호 복잡도 검증: 최소 10자, 대소문자, 숫자, 특수문자 포함
			if (passwordData.newPassword.length < 10) {
				passwordError = '새 비밀번호는 최소 10자 이상이어야 합니다.';
				return;
			}

			if (!/[A-Z]/.test(passwordData.newPassword)) {
				passwordError = '새 비밀번호는 대문자를 포함해야 합니다.';
				return;
			}

			if (!/[a-z]/.test(passwordData.newPassword)) {
				passwordError = '새 비밀번호는 소문자를 포함해야 합니다.';
				return;
			}

			if (!/[0-9]/.test(passwordData.newPassword)) {
				passwordError = '새 비밀번호는 숫자를 포함해야 합니다.';
				return;
			}

			if (!/[!@#$%^&*(),.?":{}|<>]/.test(passwordData.newPassword)) {
				passwordError = '새 비밀번호는 특수문자를 포함해야 합니다.';
				return;
			}

			// 현재 비밀번호와 새 비밀번호가 같으면 안됨
			if (passwordData.currentPasswordForChange === passwordData.newPassword) {
				passwordError = '새 비밀번호는 현재 비밀번호와 달라야 합니다.';
				return;
			}
		}

		try {
			// ⭐ v8.0: 수정 가능한 필드만 전송
			// 변경 불가: loginId, grade, salesperson, salespersonPhone, planner, plannerPhone
			const requestBody = {
				name: userInfo.name,
				phone: userInfo.phone,
				bank: userInfo.bank,
				accountNumber: userInfo.accountNumber,
				idNumber: userInfo.idNumber,
				insuranceCompany: userInfo.insuranceCompany,
				insuranceProduct: userInfo.insuranceProduct,
				branch: userInfo.branch
			};

			// 패스워드 변경이 있는 경우 추가
			if (passwordData.currentPasswordForChange) {
				requestBody.currentPassword = passwordData.currentPasswordForChange;
				requestBody.newPassword = passwordData.newPassword;
			}

			const response = await fetch('/api/user/profile', {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(requestBody)
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.message || '저장에 실패했습니다.');
			}

			// ⭐ v8.0: 업데이트된 프로필 정보로 userInfo 갱신
			if (data.profile) {
				userInfo = { ...userInfo, ...data.profile };
			}

			saveMessage = data.message || '정보가 저장되었습니다.';
			editMode = false;

			// 패스워드 필드 초기화
			passwordData = {
				currentPasswordForChange: '',
				newPassword: '',
				confirmPassword: ''
			};

			// 메시지 3초 후 자동 제거
			setTimeout(() => {
				saveMessage = '';
			}, 3000);
		} catch (err) {
			console.error('❌ Error saving profile:', err);
			passwordError = err.message;
		}
	}
</script>

<svelte:head>
	<title>내 정보 - 나눔페이</title>
</svelte:head>

{#if isLoading}
	<div class="flex h-screen items-center justify-center">
		<div class="text-gray-500">로딩 중...</div>
	</div>
{:else if error}
	<div class="flex h-screen items-center justify-center">
		<div class="text-center">
			<p class="mb-2 text-red-500">{error}</p>
		</div>
	</div>
{:else}
	<!-- 비밀번호 확인 모달 -->
	<WindowsModal isOpen={showPasswordPrompt} title="비밀번호 확인" icon="/icons/lock.svg" size="sm" onClose={cancelPasswordPrompt}>
		<p class="mb-4 text-sm text-gray-600">정보를 편집하려면 비밀번호를 입력해주세요.</p>

		{#if verifyError}
			<div class="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">
				{verifyError}
			</div>
		{/if}

		<input
			type="password"
			bind:value={verifyPassword}
			placeholder="비밀번호 입력"
			class="mb-4 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
			onkeydown={(e) => {
				if (e.key === 'Enter') verifyPasswordAndEnterEdit();
			}}
		/>

		<svelte:fragment slot="footer">
			<button
				onclick={cancelPasswordPrompt}
				class="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
			>
				취소
			</button>
			<button
				onclick={verifyPasswordAndEnterEdit}
				class="rounded-md bg-blue-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-600"
			>
				확인
			</button>
		</svelte:fragment>
	</WindowsModal>

	<div class="container">
		<h1 class="title">내 정보</h1>

		{#if saveMessage}
			<div class="mb-4 rounded-lg bg-green-50 p-4 text-center text-sm text-green-600">
				{saveMessage}
			</div>
		{/if}

		{#if passwordError}
			<div class="mb-4 rounded-lg bg-red-50 p-4 text-center text-sm text-red-600">
				{passwordError}
			</div>
		{/if}

		<div class="overflow-hidden bg-white shadow sm:rounded-lg">
			<div
				class="flex items-center justify-end border-b border-gray-200 bg-gray-50 px-4 py-3 sm:px-6"
			>
				<button
					onclick={toggleEdit}
					class="rounded-md bg-blue-500 px-3 py-1.5 text-sm text-white transition-colors hover:bg-blue-600"
				>
					{editMode ? '취소' : '수정'}
				</button>
			</div>
			<div class="px-4 py-5">
				<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
					<!-- 왼쪽 열 -->
					<div class="space-y-4">
						<div class="flex items-center">
							<label class="w-32 text-sm font-bold text-gray-700">이름</label>
							{#if editMode}
								<input
									type="text"
									bind:value={userInfo.name}
									class="flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm"
									placeholder="이름"
								/>
							{:else}
								<span class="text-sm text-gray-900">{userInfo.name || '-'}</span>
							{/if}
						</div>
						<div class="flex items-center">
							<label class="w-32 text-sm font-bold text-gray-700">아이디</label>
							<span class="text-sm text-gray-500">{userInfo.loginId || '-'} (변경 불가)</span>
						</div>
						<div class="flex items-center">
							<label class="w-32 text-sm font-bold text-gray-700">등급</label>
							<div class="flex items-center gap-2">
								{#if userInfo.grade}
									<img
										src="/icons/{userInfo.grade}.svg"
										alt={userInfo.grade}
										class="h-6 w-6"
										title="{userInfo.grade} 등급"
									/>
								{:else}
									<span class="text-sm text-gray-900">-</span>
								{/if}
							</div>
						</div>
						<div class="flex items-center">
							<label class="w-32 text-sm font-bold text-gray-700">전화번호</label>
							{#if editMode}
								<input
									type="text"
									bind:value={userInfo.phone}
									class="flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm"
									placeholder="010-0000-0000"
								/>
							{:else}
								<span class="text-sm text-gray-900">{userInfo.phone || '-'}</span>
							{/if}
						</div>
						
						<div class="flex items-center">
							<label class="w-32 text-sm font-bold text-gray-700">은행</label>
							{#if editMode}
								<input
									type="text"
									bind:value={userInfo.bank}
									class="flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm"
									placeholder="은행명"
								/>
							{:else}
								<span class="text-sm text-gray-900">{userInfo.bank || '-'}</span>
							{/if}
						</div>
						<div class="flex items-center">
							<label class="w-32 text-sm font-bold text-gray-700">계좌번호</label>
							{#if editMode}
								<input
									type="text"
									bind:value={userInfo.accountNumber}
									class="flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm"
									placeholder="계좌번호"
								/>
							{:else}
								<span class="text-sm text-gray-900">{userInfo.accountNumber || '-'}</span>
							{/if}
						</div>
						<div class="flex items-center">
							<label class="w-32 text-sm font-bold text-gray-700">주민번호</label>
							{#if editMode}
								<input
									type="text"
									bind:value={userInfo.idNumber}
									class="flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm"
									placeholder="123456-1234567"
								/>
							{:else}
								<span class="text-sm text-gray-900">{userInfo.idNumber || '-'}</span>
							{/if}
						</div>
					</div>

					<!-- 오른쪽 열 -->
					<div class="space-y-4">
						{#if userInfo.grade && ['F3', 'F4', 'F5', 'F6', 'F7', 'F8'].includes(userInfo.grade)}
							<div class="flex items-center">
								<label class="w-32 text-sm font-bold text-gray-700">보험 가입</label>
								<span
									class="text-sm font-medium {userInfo.insuranceActive
										? 'text-green-600'
										: 'text-red-600'}"
								>
									{userInfo.insuranceActive ? '가입' : '미가입'}
								</span>
							</div>
							<div class="flex items-center">
								<label class="w-32 text-sm font-bold text-gray-700">보험회사</label>
								{#if editMode}
									<input
										type="text"
										bind:value={userInfo.insuranceCompany}
										class="flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm"
										placeholder="보험회사"
									/>
								{:else}
									<span class="text-sm text-gray-900">{userInfo.insuranceCompany || '-'}</span>
								{/if}
							</div>
							<div class="flex items-center">
								<label class="w-32 text-sm font-bold text-gray-700">보험상품</label>
								{#if editMode}
									<input
										type="text"
										bind:value={userInfo.insuranceProduct}
										class="flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm"
										placeholder="보험상품"
									/>
								{:else}
									<span class="text-sm text-gray-900">{userInfo.insuranceProduct || '-'}</span>
								{/if}
							</div>
						{/if}
						<div class="flex items-center">
							<label class="w-32 text-sm font-bold text-gray-700">소속/지사</label>
							{#if editMode}
								<input
									type="text"
									bind:value={userInfo.branch}
									class="flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm"
									placeholder="소속/지사"
								/>
							{:else}
								<span class="text-sm text-gray-900">{userInfo.branch || '-'}</span>
							{/if}
						</div>
						<div class="flex items-center">
							<label class="w-32 text-sm font-bold text-gray-700">판매인</label>
							<span class="text-sm text-gray-900">{userInfo.salesperson || '-'}</span>
						</div>
						<div class="flex items-center">
							<label class="w-32 text-sm font-bold text-gray-700">판매인 연락처</label>
							<span class="text-sm text-gray-900">{userInfo.salespersonPhone || '-'}</span>
						</div>
						<div class="flex items-center">
							<label class="w-32 text-sm font-bold text-gray-700">설계사</label>
							<span class="text-sm text-gray-900">{userInfo.planner || '-'}</span>
						</div>
						<div class="flex items-center">
							<label class="w-32 text-sm font-bold text-gray-700">설계사 연락처</label>
							<span class="text-sm text-gray-900">{userInfo.plannerPhone || '-'}</span>
						</div>
					</div>
				</div>

				{#if editMode}
					<!-- 비밀번호 변경 섹션 -->
					<div class="mt-6 border-t border-gray-200 pt-4">
						<h4 class="mb-3 text-sm font-bold text-gray-900">비밀번호 변경 (선택)</h4>
						<div class="grid grid-cols-1 gap-3 md:grid-cols-3">
							<div>
								<label class="mb-1 block text-xs font-bold text-gray-700">현재 비밀번호</label>
								<input
									type="password"
									bind:value={passwordData.currentPasswordForChange}
									placeholder="현재 비밀번호"
									class="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
								/>
							</div>
							<div>
								<label class="mb-1 block text-xs font-bold text-gray-700">새 비밀번호</label>
								<input
									type="password"
									bind:value={passwordData.newPassword}
									placeholder="새 비밀번호"
									class="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
								/>
							</div>
							<div>
								<label class="mb-1 block text-xs font-bold text-gray-700">새 비밀번호 확인</label>
								<input
									type="password"
									bind:value={passwordData.confirmPassword}
									placeholder="확인"
									class="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
								/>
							</div>
						</div>
						<p class="mt-2 text-xs text-gray-500">
							* 비밀번호 규칙: 대소문자, 숫자, 특수문자 포함 10자 이상
						</p>
						<p class="mt-1 text-xs text-gray-500">
							* 비밀번호를 변경하지 않으려면 이 필드들을 비워두세요.
						</p>
					</div>

					<div class="mt-4 flex justify-end gap-2">
						<button
							onclick={toggleEdit}
							class="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
						>
							취소
						</button>
						<button
							onclick={saveInfo}
							class="rounded-md bg-green-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-green-600"
						>
							저장
						</button>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	@reference "$lib/../app.css";

	.container {
		padding: 20px;
		max-width: 1200px;
		margin: 0 auto;
		background: white;
	}

	.title {
		font-size: 20px;
		font-weight: 700;
		text-align: center;
		margin-bottom: 20px;
		color: #1f2937;
	}

	/* 모바일 반응형 */
	@media (max-width: 480px) {
		.container {
			padding: 10px;
		}

		.title {
			font-size: 18px;
			margin-bottom: 15px;
		}
	}
</style>
