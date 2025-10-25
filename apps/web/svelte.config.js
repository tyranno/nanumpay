import adapter from '@jesterkit/exe-sveltekit';

export default {
	kit: {
		adapter: adapter({
			out: 'dist',
			target: process.platform === 'win32' ? 'windows-x64' : 'linux-x64',
			binaryName: process.platform === 'win32' ? 'nanumpay.exe' : 'nanumpay',
			external: ['bcrypt']
		})
	},
	vitePlugin: { inspector: true },
	onwarn: (warning, handler) => {
		// a11y 경고 무시 (배포용)
		if (warning.code.startsWith('a11y-')) return;
		// CSS unused selector 경고 무시
		if (warning.code === 'css-unused-selector') return;
		handler(warning);
	}
};
