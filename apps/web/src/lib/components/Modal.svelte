<script>
	import { getModalClass, theme } from '$lib/theme.js';
	import Button from './Button.svelte';

	let {
		show = $bindable(false),
		size = 'md',
		title = '',
		showFooter = true,
		onCancel = () => { show = false; },
		onConfirm = null,
		cancelText = '취소',
		confirmText = '확인',
		confirmVariant = 'primary'
	} = $props();

	$: modalClasses = getModalClass(size);

	function handleOverlayClick(e) {
		if (e.target === e.currentTarget) {
			onCancel();
		}
	}
</script>

{#if show}
	<div class={modalClasses.overlay} onclick={handleOverlayClick}>
		<div class={modalClasses.container}>
			{#if title}
				<h3 class={theme.header.h3 + ' mb-4'}>{title}</h3>
			{/if}

			<slot />

			{#if showFooter}
				<div class="flex justify-end gap-3 mt-6">
					<Button variant="outline" size="sm" onclick={onCancel}>
						{cancelText}
					</Button>
					{#if onConfirm}
						<Button variant={confirmVariant} size="sm" onclick={onConfirm}>
							{confirmText}
						</Button>
					{/if}
				</div>
			{/if}
		</div>
	</div>
{/if}