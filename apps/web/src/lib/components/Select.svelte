<script>
	import { getSelectClass, theme } from '$lib/theme.js';

	let {
		size = 'sm',
		value = $bindable(),
		disabled = false,
		onchange = null,
		class: className = '',
		...rest
	} = $props();

	$: selectClass = getSelectClass(size) + ' ' + className;
</script>

<select
	bind:value
	{disabled}
	{onchange}
	class={selectClass}
	style={theme.select.backgroundImage}
	{...rest}
>
	<slot />
</select>