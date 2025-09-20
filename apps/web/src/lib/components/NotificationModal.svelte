<script>
	export let isOpen = false;
	export let title = '알림';
	export let type = 'info'; // info, success, warning, error
	export let onClose = () => { isOpen = false; };

	// Main message
	export let message = '';

	// Detailed results
	export let results = null;

	// Detailed items list
	export let details = [];

	// Actions
	export let primaryAction = null;
	export let secondaryAction = null;

	const typeConfig = {
		info: {
			bgColor: 'bg-gray-700',
			iconBg: 'bg-blue-50',
			iconColor: 'text-blue-600',
			borderColor: 'border-gray-200',
			textColor: 'text-gray-900'
		},
		success: {
			bgColor: 'bg-gray-700',
			iconBg: 'bg-green-50',
			iconColor: 'text-green-600',
			borderColor: 'border-gray-200',
			textColor: 'text-gray-900'
		},
		warning: {
			bgColor: 'bg-gray-700',
			iconBg: 'bg-amber-50',
			iconColor: 'text-amber-600',
			borderColor: 'border-gray-200',
			textColor: 'text-gray-900'
		},
		error: {
			bgColor: 'bg-gray-700',
			iconBg: 'bg-red-50',
			iconColor: 'text-red-600',
			borderColor: 'border-gray-200',
			textColor: 'text-gray-900'
		}
	};

	$: config = typeConfig[type] || typeConfig.info;

	function handleKeydown(event) {
		if (event.key === 'Escape') {
			onClose();
		}
	}
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
	<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
		<div class="bg-white rounded-lg shadow-xl max-w-xs w-full animate-scaleIn">
			<!-- Compact Header -->
			<div class="flex items-center justify-between p-3 border-b">
				<span class="text-sm font-medium text-gray-900">{title}</span>
				<button on:click={onClose} class="text-gray-400 hover:text-gray-600">
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
					</svg>
				</button>
			</div>

			<!-- Content -->
			<div class="p-3 max-h-64 overflow-y-auto">
				{#if message}
					<p class="text-xs text-gray-600 mb-2">{message}</p>
				{/if}

				{#if results}
					<div class="flex gap-3 text-xs mb-2">
						{#if results.created !== undefined}
							<span class="text-green-600">✓ 성공: {results.created}</span>
						{/if}
						{#if results.failed !== undefined && results.failed > 0}
							<span class="text-red-600">✗ 실패: {results.failed}</span>
						{/if}
					</div>
				{/if}

				{#if results?.alerts && results.alerts.length > 0}
					<div class="text-xs text-yellow-600 mb-2">
						{results.alerts[0].message}
						{#if results.alerts.length > 1}
							외 {results.alerts.length - 1}건
						{/if}
					</div>
				{/if}

				{#if results?.errors && results.errors.length > 0}
					<div class="text-xs text-red-600">
						{#if results.errors.length <= 2}
							{#each results.errors as error}
								<p class="mb-1">• {error}</p>
							{/each}
						{:else}
							<p>• {results.errors[0]}</p>
							<p>• 외 {results.errors.length - 1}개 오류 (잘못된 형식)</p>
						{/if}
					</div>
				{/if}


				{#if details && details.length > 0}
					<div class="space-y-2">
						{#each details as detail}
							<div class="p-3 bg-gray-50 rounded-lg {detail.type === 'error' ? 'border border-red-200' : ''}">
								<div class="flex items-start gap-2">
									{#if detail.icon}
										<div class="{detail.type === 'error' ? 'text-red-500' : 'text-gray-500'}">
											{@html detail.icon}
										</div>
									{/if}
									<div class="flex-1">
										{#if detail.title}
											<p class="text-sm font-semibold {detail.type === 'error' ? 'text-red-900' : 'text-gray-900'}">{detail.title}</p>
										{/if}
										{#if detail.content}
											<p class="text-xs {detail.type === 'error' ? 'text-red-700' : 'text-gray-600'} mt-1 whitespace-pre-wrap">{detail.content}</p>
										{/if}
									</div>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Simple Footer -->
			<div class="p-3 border-t flex justify-end">
				<button
					on:click={onClose}
					class="px-4 py-1.5 text-xs font-medium text-white bg-gray-600 rounded hover:bg-gray-700"
				>
					확인
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	@keyframes scaleIn {
		from {
			transform: scale(0.9);
			opacity: 0;
		}
		to {
			transform: scale(1);
			opacity: 1;
		}
	}

	.animate-scaleIn {
		animation: scaleIn 0.2s ease-out;
	}
</style>