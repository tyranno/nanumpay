<script>
	import { getButtonClass, theme } from '$lib/theme.js';

	let {
		variant = 'primary',
		size = 'sm',
		type = 'button',
		disabled = false,
		onclick = null,
		icon = null,
		iconPosition = 'left',
		isIconOnly = false,
		class: className = '',
		...rest
	} = $props();

	$: buttonClass = getButtonClass(variant, size, isIconOnly) + ' ' + className;
	$: iconClass = theme.icon[size] || theme.icon.md;
</script>

<button
	{type}
	{disabled}
	{onclick}
	class={buttonClass}
	{...rest}
>
	{#if icon && iconPosition === 'left' && !isIconOnly}
		<img src={icon} alt="" class="{iconClass} {variant === 'primary' || variant === 'success' || variant === 'danger' || variant === 'warning' ? 'filter brightness-0 invert' : ''}" />
	{/if}

	{#if !isIconOnly}
		<slot />
	{:else if icon}
		<img src={icon} alt="" class="{iconClass} {variant === 'primary' || variant === 'success' || variant === 'danger' || variant === 'warning' ? 'filter brightness-0 invert' : ''}" />
	{/if}

	{#if icon && iconPosition === 'right' && !isIconOnly}
		<img src={icon} alt="" class="{iconClass} {variant === 'primary' || variant === 'success' || variant === 'danger' || variant === 'warning' ? 'filter brightness-0 invert' : ''}" />
	{/if}
</button>