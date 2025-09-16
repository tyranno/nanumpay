import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '');

	return {
		plugins: [tailwindcss(), sveltekit()],
		server: {
			port: parseInt(env.PORT || '3000')
		},
		optimizeDeps: {
			exclude: ['@capacitor/storage']
		},
		build: {
			rollupOptions: {
				external: ['@capacitor/storage']
			}
		}
	};
});
