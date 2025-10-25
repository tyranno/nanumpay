<script>
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';

	let loginId = '';
	let password = '';
	let isLoading = false;
	let errorMessage = '';
	let showPassword = false;

	// 로그인 페이지 진입 시 클라이언트 저장소 정리
	onMount(() => {
		localStorage.clear();
		sessionStorage.clear();
	});

	async function handleSubmit(e) {
		e.preventDefault();
		isLoading = true;
		errorMessage = '';

		try {
			const response = await fetch('/api/auth/login', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ loginId, password })
			});

			const data = await response.json();

			if (response.ok) {
				// 암호 변경 필요 여부를 sessionStorage에 저장
				if (data.requirePasswordChange) {
					sessionStorage.setItem('requirePasswordChange', 'true');
				}

				// 서버에서 반환한 userType에 따라 리다이렉션
				if (data.userType === 'admin') {
					goto('/admin', { replaceState: true });
				} else if (data.userType === 'planner') {
					// 설계사는 설계사 전용 대시보드로
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
</script>

<div class="min-h-screen flex items-center justify-center bg-gray-50">
	<div class="max-w-md w-full space-y-8">
		<div>
			<div class="text-center">
				<img src="/logo.png" alt="나눔에셋" class="h-20 w-20 mx-auto mb-4" />
				<h1 class="text-4xl font-bold text-blue-600 mb-2">나눔에셋</h1>
				<h2 class="text-2xl font-medium text-gray-700">Nanumpay System</h2>
				<p class="mt-2 text-sm text-gray-600">통합 관리 시스템</p>
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