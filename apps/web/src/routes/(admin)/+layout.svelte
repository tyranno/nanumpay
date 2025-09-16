<script>
	import { goto } from '$app/navigation';

	let { children } = $props();

	async function logout() {
		await fetch('/api/auth/logout', { method: 'POST' });
		goto('/login');
	}
</script>

<div class="min-h-screen bg-gray-100">
	<nav class="bg-white shadow-sm">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
			<div class="flex justify-between h-16">
				<div class="flex items-center">
					<img src="/logo.svg" alt="나눔에셋" class="h-8 w-8 mr-3" />
					<h1 class="text-xl font-semibold text-blue-600">나눔에셋 관리자</h1>
				</div>
				<div class="flex items-center space-x-4">
					<span class="text-sm text-gray-500">관리자 모드</span>
					<button
						onclick={logout}
						class="text-gray-500 hover:text-gray-700 px-3 py-2 rounded-md text-sm font-medium"
					>
						로그아웃
					</button>
				</div>
			</div>
		</div>
	</nav>

	<main class="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
		{@render children?.()}
	</main>
</div>