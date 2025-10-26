// apps/web/src/routes/api/admin/backup/download/+server.js
import { error } from '@sveltejs/kit';
import fs from 'fs/promises';
import path from 'path';
import { createReadStream } from 'fs';

/** @type {import('./$types').RequestHandler} */
export async function GET({ locals, url }) {
	// 관리자 권한 확인
	if (!locals.user || (locals.user.type !== 'admin' && locals.user.role !== 'admin')) {
		throw error(403, '관리자 권한이 필요합니다.');
	}

	const filename = url.searchParams.get('file');
	if (!filename) {
		throw error(400, '파일명이 필요합니다.');
	}

	// 파일명 검증 (경로 조작 방지)
	if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
		throw error(400, '잘못된 파일명입니다.');
	}

	// 백업 파일만 허용 (nanumpay-backup-YYYY-MM-DDTHH-MM-SS.tar.gz 형식)
	if (!/^nanumpay-backup-.+\.tar\.gz$/.test(filename)) {
		throw error(400, '잘못된 백업 파일 형식입니다.');
	}

	try {
		// 백업 디렉토리 경로
		const backupDir = process.env.BACKUP_PATH || '/opt/nanumpay/backups';
		const filePath = path.join(backupDir, filename);

		console.log(`[backup-download] 파일 다운로드 요청: ${filePath}`);

		// 파일 존재 확인
		try {
			await fs.access(filePath);
		} catch {
			throw error(404, '백업 파일을 찾을 수 없습니다.');
		}

		// 파일 크기 확인
		const stats = await fs.stat(filePath);
		console.log(`[backup-download] 파일 크기: ${stats.size} bytes`);

		// 파일 스트림 생성
		const stream = createReadStream(filePath);

		// ReadableStream으로 변환 (SvelteKit Response용)
		const readableStream = new ReadableStream({
			start(controller) {
				stream.on('data', (chunk) => {
					controller.enqueue(chunk);
				});
				stream.on('end', () => {
					controller.close();
				});
				stream.on('error', (err) => {
					console.error('[backup-download] 스트림 오류:', err);
					controller.error(err);
				});
			},
			cancel() {
				stream.destroy();
			}
		});

		return new Response(readableStream, {
			headers: {
				'Content-Type': 'application/gzip',
				'Content-Disposition': `attachment; filename="${filename}"`,
				'Content-Length': stats.size.toString()
			}
		});

	} catch (err) {
		if (err.status) {
			throw err;
		}
		console.error('[backup-download] 다운로드 오류:', err);
		throw error(500, '파일 다운로드 중 오류가 발생했습니다.');
	}
}
