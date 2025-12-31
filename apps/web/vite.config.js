import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv, createLogger } from 'vite';

// Vite 커스텀 로거 - HMR/page reload 로그 비활성화
const logger = createLogger();
const originalInfo = logger.info;
logger.info = (msg, options) => {
	// HMR, page reload, hmr update 메시지 무시
	if (msg.includes('hmr') || msg.includes('page reload') || msg.includes('vite')) {
		return;
	}
	originalInfo(msg, options);
};

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '');

	return {
		plugins: [tailwindcss(), sveltekit()],
		customLogger: logger,
		server: {
			port: parseInt(env.PORT || '3100')
		},
		optimizeDeps: {
			exclude: ['@capacitor/storage']
		},
		build: {
			rollupOptions: {
				external: ['@capacitor/storage', 'archiver']
			}
		}
	};
});
