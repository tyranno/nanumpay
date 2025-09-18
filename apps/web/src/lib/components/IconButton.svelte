<script>
	import { theme, cn } from '$lib/theme.js';

	let {
		icon,
		size = 'sm',
		variant = 'ghost',
		title = '',
		onclick = null,
		disabled = false,
		class: className = '',
		...rest
	} = $props();

	// 아이콘 전용 버튼 스타일
	const variantClasses = {
		ghost: 'text-gray-600 hover:text-gray-900 hover:bg-gray-50',
		primary: 'text-blue-600 hover:text-blue-900 hover:bg-blue-50',
		danger: 'text-red-600 hover:text-red-900 hover:bg-red-50',
		success: 'text-green-600 hover:text-green-900 hover:bg-green-50'
	};

	$: buttonClass = cn(
		'rounded transition-colors',
		theme.button.icon[size],
		variantClasses[variant],
		className
	);
	$: iconClass = theme.icon[size] || theme.icon.md;
</script>

<button
	{onclick}
	{disabled}
	{title}
	class={buttonClass}
	{...rest}
>
	<img src={icon} alt={title} class={iconClass} />
</button>