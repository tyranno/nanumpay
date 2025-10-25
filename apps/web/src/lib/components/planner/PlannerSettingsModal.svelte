<script>
	import WindowsModal from '$lib/components/WindowsModal.svelte';

	// Props
	export let isOpen = false;
	export let plannerInfo = null;
	export let onClose = () => {};
	export let onUpdated = () => {};

	// 상태
	let activeTab = 'info'; // 'info' | 'password'
	let isSubmitting = false;
	let errorMessage = '';
	let successMessage = '';

	// 기본 정보
	let phone = '';
	let email = '';
	let address = '';
	let workplace = '';

	// 암호 변경
	let currentPassword = '';
	let newPassword = '';
	let confirmPassword = '';
	
	// 암호 보기 토글
	let showCurrentPassword = false;
	let showNewPassword = false;
	let showConfirmPassword = false;

	// plannerInfo 변경 시 초기화
	$: if (plannerInfo && isOpen) {
		phone = plannerInfo.phone || '';
		email = plannerInfo.email || '';
		address = plannerInfo.address || '';
		workplace = plannerInfo.workplace || '';
		currentPassword = '';
		newPassword = '';
		confirmPassword = '';
		errorMessage = '';
		successMessage = '';
		activeTab = 'info';
	}

	async function handleSaveInfo() {
		errorMessage = '';
		successMessage = '';
		isSubmitting = true;

		try {
			const response = await fetch('/api/planner/update-info', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ phone, email, address, workplace })
			});

			const data = await response.json();

			if (response.ok) {
				successMessage = '정보가 수정되었습니다.';
				onUpdated(data.planner);
				setTimeout(() => (successMessage = ''), 2000);
			} else {
				errorMessage = data.error || '정보 수정에 실패했습니다.';
			}
		} catch (error) {
			console.error('정보 수정 오류:', error);
			errorMessage = '서버 오류가 발생했습니다.';
		} finally {
			isSubmitting = false;
		}
	}

	async function handleChangePassword() {
		errorMessage = '';
		successMessage = '';

		if (!currentPassword || !newPassword || !confirmPassword) {
			errorMessage = '모든 암호 필드를 입력해주세요.';
			return;
		}

		if (newPassword !== confirmPassword) {
			errorMessage = '새 암호와 암호 확인이 일치하지 않습니다.';
			return;
		}

		if (newPassword.length < 10) {
			errorMessage = '암호는 최소 10자 이상이어야 합니다.';
			return;
		}

		// 대문자, 소문자, 숫자, 특수문자 포함 검사
		const hasUpperCase = /[A-Z]/.test(newPassword);
		const hasLowerCase = /[a-z]/.test(newPassword);
		const hasNumber = /[0-9]/.test(newPassword);
		const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword);

		if (!hasUpperCase || !hasLowerCase || !hasNumber || !hasSpecialChar) {
			errorMessage = '암호는 대문자, 소문자, 숫자, 특수문자를 모두 포함해야 합니다.';
			return;
		}

		isSubmitting = true;

		try {
			const response = await fetch('/api/planner/update-info', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
			});

			const data = await response.json();

			if (response.ok) {
				successMessage = '암호가 변경되었습니다.';
				currentPassword = '';
				newPassword = '';
				confirmPassword = '';
				setTimeout(() => (successMessage = ''), 2000);
			} else {
				errorMessage = data.error || '암호 변경에 실패했습니다.';
			}
		} catch (error) {
			console.error('암호 변경 오류:', error);
			errorMessage = '서버 오류가 발생했습니다.';
		} finally {
			isSubmitting = false;
		}
	}
</script>

<WindowsModal {isOpen} title="설계사 설정" icon="/icons/settings-white.svg" size="md" {onClose} showFooter={false}>
	<div class="h-[306px] flex flex-col">
	<!-- Tabs -->
	<div class="mb-1.5 flex border-b border-gray-200 flex-shrink-0">
		<button
			class="tab {activeTab === 'info' ? 'active' : ''}"
			onclick={() => (activeTab = 'info')}
		>
			기본 정보
		</button>
		<button
			class="tab {activeTab === 'password' ? 'active' : ''}"
			onclick={() => (activeTab = 'password')}
		>
			암호 변경
		</button>
	</div>

	<!-- Alerts -->
	<div class="flex-shrink-0">
	{#if errorMessage}
		<div class="mb-1.5 rounded bg-red-50 px-2 py-0.5 text-xs text-red-700 border border-red-200">
			{errorMessage}
		</div>
	{/if}

	{#if successMessage}
		<div class="mb-1.5 rounded bg-green-50 px-2 py-0.5 text-xs text-green-700 border border-green-200">
			{successMessage}
		</div>
	{/if}
	</div>

	<div class="flex-1 overflow-auto">
	{#if activeTab === 'info'}
		<!-- 기본 정보 탭 -->
		<form id="infoForm" onsubmit={(e) => { e.preventDefault(); handleSaveInfo(); }}>
			<div class="grid grid-cols-2 gap-1.5">
				<!-- 아이디 -->
				<div>
					<label class="label">아이디</label>
					<input type="text" value={plannerInfo?.loginId || ''} disabled class="input-disabled" />
				</div>

				<!-- 이름 -->
				<div>
					<label class="label">이름</label>
					<input type="text" value={plannerInfo?.name || ''} disabled class="input-disabled" />
				</div>

				<!-- 전화번호 -->
				<div>
					<label class="label">전화번호 <span class="text-red-600">*</span></label>
					<input
						type="tel"
						bind:value={phone}
						placeholder="010-0000-0000"
						required
						class="input"
					/>
				</div>

				<!-- 이메일 -->
				<div>
					<label class="label">이메일</label>
					<input type="email" bind:value={email} placeholder="이메일" class="input" />
				</div>

				<!-- 주소 -->
				<div class="col-span-2">
					<label class="label">주소</label>
					<input type="text" bind:value={address} placeholder="주소" class="input" />
				</div>

				<!-- 근무지 -->
				<div class="col-span-2">
					<label class="label">근무지</label>
					<input type="text" bind:value={workplace} placeholder="근무지" class="input" />
				</div>
			</div>
		</form>
	{:else if activeTab === 'password'}
		<!-- 암호 변경 탭 -->
		<form id="passwordForm" onsubmit={(e) => { e.preventDefault(); handleChangePassword(); }}>
			<div class="space-y-1.5">
				<!-- 현재 암호 -->
				<div>
					<label class="label">현재 암호 <span class="text-red-600">*</span></label>
					<div class="password-field">
						<input
							type={showCurrentPassword ? 'text' : 'password'}
							bind:value={currentPassword}
							placeholder="현재 암호"
							required
							class="input"
						/>
						<button
							type="button"
							class="password-toggle"
							onclick={() => (showCurrentPassword = !showCurrentPassword)}
							tabindex="-1"
						>
							{#if showCurrentPassword}
								<svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
								</svg>
							{:else}
								<svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
								</svg>
							{/if}
						</button>
					</div>
				</div>

				<!-- 새 암호 -->
				<div>
					<label class="label">새 암호 <span class="text-red-600">*</span></label>
					<div class="password-field">
						<input
							type={showNewPassword ? 'text' : 'password'}
							bind:value={newPassword}
							placeholder="최소 10자, 대소문자+숫자+특수문자"
							required
							minlength="10"
							class="input"
						/>
						<button
							type="button"
							class="password-toggle"
							onclick={() => (showNewPassword = !showNewPassword)}
							tabindex="-1"
						>
							{#if showNewPassword}
								<svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
								</svg>
							{:else}
								<svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
								</svg>
							{/if}
						</button>
					</div>
				</div>

				<!-- 암호 확인 -->
				<div>
					<label class="label">암호 확인 <span class="text-red-600">*</span></label>
					<div class="password-field">
						<input
							type={showConfirmPassword ? 'text' : 'password'}
							bind:value={confirmPassword}
							placeholder="새 암호 확인"
							required
							minlength="10"
							class="input"
						/>
						<button
							type="button"
							class="password-toggle"
							onclick={() => (showConfirmPassword = !showConfirmPassword)}
							tabindex="-1"
						>
							{#if showConfirmPassword}
								<svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
								</svg>
							{:else}
								<svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
								</svg>
							{/if}
						</button>
					</div>
				</div>
			</div>
		</form>
	{/if}
	</div>

	<!-- 하단 고정 버튼 영역 -->
	<div class="button-overlay">
		<button type="button" class="btn-secondary" onclick={onClose}>취소</button>
		{#if activeTab === 'info'}
			<button type="submit" form="infoForm" class="btn-primary" disabled={isSubmitting}>
				{isSubmitting ? '저장 중...' : '저장'}
			</button>
		{:else}
			<button type="submit" form="passwordForm" class="btn-primary" disabled={isSubmitting}>
				{isSubmitting ? '변경 중...' : '암호 변경'}
			</button>
		{/if}
	</div>
	</div>
</WindowsModal>

<style>
	.tab {
		padding: 0.5rem 1rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: #6b7280;
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		cursor: pointer;
		transition: all 0.2s;
	}

	.tab:hover {
		color: #4b5563;
	}

	.tab.active {
		color: #3b82f6;
		border-bottom-color: #3b82f6;
	}

	.label {
		display: block;
		margin-bottom: 0.125rem;
		font-size: 0.6875rem;
		font-weight: 600;
		color: #374151;
	}

	.password-field {
		position: relative;
		width: 100%;
	}

	.password-toggle {
		position: absolute;
		right: 0.375rem;
		top: 50%;
		transform: translateY(-50%);
		padding: 0.25rem;
		background: none;
		border: none;
		color: #6b7280;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: color 0.2s;
	}

	.password-toggle:hover {
		color: #3b82f6;
	}

	.password-toggle .icon {
		width: 1rem;
		height: 1rem;
	}

	.input,
	.input-disabled {
		width: 100%;
		padding: 0.375rem 0.5rem;
		border: 1px solid #d1d5db;
		border-radius: 4px;
		font-size: 0.75rem;
		line-height: 1.2;
	}

	.password-field .input {
		padding-right: 2rem;
	}

	.input:focus {
		outline: none;
		border-color: #3b82f6;
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
	}

	.input-disabled {
		background-color: #f9fafb;
		color: #6b7280;
		cursor: not-allowed;
	}

	.btn-primary {
		padding: 0.375rem 0.75rem;
		background-color: #3b82f6;
		color: white;
		border: none;
		border-radius: 4px;
		font-size: 0.8125rem;
		font-weight: 600;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.btn-primary:hover:not(:disabled) {
		background-color: #2563eb;
	}

	.btn-primary:disabled {
		background-color: #9ca3af;
		cursor: not-allowed;
	}

	.btn-secondary {
		padding: 0.375rem 0.75rem;
		background-color: #f3f4f6;
		color: #374151;
		border: none;
		border-radius: 4px;
		font-size: 0.8125rem;
		font-weight: 600;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.btn-secondary:hover {
		background-color: #e5e7eb;
	}

	.button-overlay {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		padding: 0.375rem 0.75rem;
		background: white;
		border-top: 1px solid #e5e7eb;
		flex-shrink: 0;
	}
</style>
