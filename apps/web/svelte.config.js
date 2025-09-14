import adapter from '@jesterkit/exe-sveltekit';

export default {
	kit: {
		adapter: adapter({
			out: 'dist',
			target: process.platform === 'win32' ? 'windows-x64' : 'linux-x64',
			binaryName: process.platform === 'win32' ? 'agent-tree.exe' : 'agent-tree'
		})
	},
	vitePlugin: { inspector: true }
};
