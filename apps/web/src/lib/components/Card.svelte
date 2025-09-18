<script>
	import { theme, cn } from '$lib/theme.js';

	let {
		padding = 'md',
		class: className = '',
		...rest
	} = $props();

	$: cardClass = cn(theme.card.base, theme.card.padding[padding], className);
</script>

<div class={cardClass} {...rest}>
	<slot />
</div>