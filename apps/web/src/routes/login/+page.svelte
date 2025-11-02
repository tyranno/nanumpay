<script>
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';

	let loginId = '';
	let password = '';
	let isLoading = false;
	let errorMessage = '';
	let showPassword = false;

	// 여러 계정 타입이 있을 때 선택 UI 표시
	let showAccountTypeSelection = false;
	let availableTypes = [];
	let selectedType = '';

	// 로그인 페이지 진입 시 클라이언트 저장소 정리 및 히스토리 방지
	onMount(() => {
		localStorage.clear();
		sessionStorage.clear();

		// 히스토리 대체 (뒤로가기로 인증 페이지 접근 방지)
		// replaceState를 사용하여 현재 히스토리 항목을 로그인 페이지로 교체
		window.history.replaceState(null, '', '/login');

		// popstate 이벤트 리스너 (뒤로가기 시도 감지)
		const handlePopState = (e) => {
			// 뒤로가기 시도 시 다시 로그인 페이지로 푸시
			window.history.pushState(null, '', '/login');
		};

		window.addEventListener('popstate', handlePopState);

		return () => {
			window.removeEventListener('popstate', handlePopState);
		};
	});

	async function handleSubmit(e) {
		e.preventDefault();

		// 선택 UI가 표시된 상태면 선택된 타입으로 재로그인
		if (showAccountTypeSelection) {
			showAccountTypeSelection = false;
		}

		isLoading = true;
		errorMessage = '';

		try {
			const requestBody = { loginId, password };

			// 계정 타입이 선택된 경우 포함
			if (selectedType) {
				requestBody.userType = selectedType;
			}

			const response = await fetch('/api/auth/login', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(requestBody)
			});

			const data = await response.json();

			if (response.ok) {
				// 여러 계정 타입이 있는 경우
				if (data.multipleAccounts && data.availableTypes) {
					showAccountTypeSelection = true;
					availableTypes = data.availableTypes;
					selectedType = data.availableTypes[0]; // 첫 번째를 기본 선택
					errorMessage = '';
					isLoading = false;
					return;
				}

				// 단일 계정이거나 타입이 선택된 경우 - 로그인 성공
				// 암호 변경 필요 여부를 sessionStorage에 저장
				if (data.requirePasswordChange) {
					sessionStorage.setItem('requirePasswordChange', 'true');
				}

				// 서버에서 반환한 userType에 따라 리다이렉션
				if (data.userType === 'admin') {
					goto('/admin', { replaceState: true });
				} else if (data.userType === 'planner') {
					goto('/planner', { replaceState: true });
				} else {
					goto('/dashboard', { replaceState: true });
				}
			} else {
				errorMessage = data.message || '로그인에 실패했습니다.';
			}
		} catch (error) {
			errorMessage = '서버 연결에 실패했습니다.';
		} finally {
			isLoading = false;
		}
	}

	// 계정 타입 선택 후 다시 로그인
	function handleTypeSelection() {
		showAccountTypeSelection = false;
		handleSubmit(new Event('submit'));
	}
</script>

<div class="min-h-screen flex items-center justify-center bg-gray-50">
	<div class="max-w-md w-full space-y-8">
		<div>
			<div class="flex items-center justify-center gap-3">
				<img src="/logo.png" alt="나눔에셋" class="h-20 w-20" />
				<h1 class="text-4xl font-bold text-blue-600">나눔에셋</h1>
			</div>
		</div>

		<form class="mt-8 space-y-6 bg-white p-8 rounded-lg shadow-lg" onsubmit={handleSubmit}>
			<div class="space-y-4">
				<div>
					<label for="loginId" class="block text-sm font-medium text-gray-700">
						아이디
					</label>
					<input
						id="loginId"
						name="loginId"
						type="text"
						required
						autocomplete="username"
						bind:value={loginId}
						class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
						placeholder="아이디를 입력하세요"
					/>
				</div>

				<div>
				<label for="password" class="block text-sm font-medium text-gray-700">
					비밀번호
				</label>
				<div class="relative mt-1">
					<input
						id="password"
						name="password"
						type={showPassword ? 'text' : 'password'}
						required
						autocomplete="current-password"
						bind:value={password}
						class="block w-full px-3 py-2 pr-10 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
						placeholder="비밀번호를 입력하세요"
					/>
					<button
						type="button"
						class="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-blue-600 transition-colors"
						onclick={() => (showPassword = !showPassword)}
					>
						{#if showPassword}
							<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
							</svg>
						{:else}
							<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
							</svg>
						{/if}
					</button>
				</div>
			</div>
			</div>

			{#if errorMessage}
				<div class="text-sm text-red-600 text-center">
					{errorMessage}
				</div>
			{/if}

			{#if showAccountTypeSelection}
				<div class="p-3 bg-blue-50 border border-blue-200 rounded-md">
					<div class="flex items-center gap-3">
						<label class="text-sm font-medium text-gray-700 whitespace-nowrap">
							로그인 유형:
						</label>
						<div class="flex gap-3 flex-1">
							{#each availableTypes as type}
								<label class="flex items-center cursor-pointer">
									<input
										type="radio"
										name="accountType"
										value={type}
										bind:group={selectedType}
										class="h-4 w-4 text-blue-600 focus:ring-blue-500"
									/>
									<span class="ml-1.5 text-sm text-gray-700">
										{type === 'admin' ? '관리자' : type === 'planner' ? '설계자' : '사용자'}
									</span>
								</label>
							{/each}
						</div>
					</div>
				</div>
			{/if}

			<div>
				<button
					type="submit"
					disabled={isLoading}
					class="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{isLoading ? '로그인 중...' : '로그인'}
				</button>
			</div>
		</form>

		<p class="text-center text-xs text-gray-500">
			© 2024 나눔에셋. All rights reserved.
		</p>
	</div>
</div>