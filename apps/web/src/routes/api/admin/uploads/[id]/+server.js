import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import UploadHistory from '$lib/server/models/UploadHistory.js';
import fs from 'fs/promises';
import zlib from 'zlib';
import { promisify } from 'util';

const gunzip = promisify(zlib.gunzip);

/**
 * GET: 업로드된 파일 다운로드 (gzip 해제 후 전송)
 */
export async function GET({ params, locals }) {
	// 관리자 권한 확인
	if (!locals.user || !locals.user.isAdmin) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	await db();

	try {
		const { id } = params;

		const uploadRecord = await UploadHistory.findById(id).lean();

		if (!uploadRecord) {
			return json({ error: '파일을 찾을 수 없습니다.' }, { status: 404 });
		}

		// 파일 존재 확인
		try {
			await fs.access(uploadRecord.filePath);
		} catch {
			return json({ error: '파일이 서버에 존재하지 않습니다.' }, { status: 404 });
		}

		// 압축 파일 읽기 및 해제
		const compressedBuffer = await fs.readFile(uploadRecord.filePath);
		const fileBuffer = await gunzip(compressedBuffer);

		// 파일 다운로드 응답
		return new Response(fileBuffer, {
			status: 200,
			headers: {
				'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(uploadRecord.originalFileName)}`,
				'Content-Length': fileBuffer.length.toString()
			}
		});
	} catch (err) {
		console.error('Download file error:', err);
		return json({ error: '파일 다운로드 중 오류가 발생했습니다.' }, { status: 500 });
	}
}

/**
 * DELETE: 업로드 기록 삭제 (파일도 함께 삭제)
 */
export async function DELETE({ params, locals }) {
	// 관리자 권한 확인
	if (!locals.user || !locals.user.isAdmin) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	await db();

	try {
		const { id } = params;

		const uploadRecord = await UploadHistory.findById(id);

		if (!uploadRecord) {
			return json({ error: '파일을 찾을 수 없습니다.' }, { status: 404 });
		}

		// 파일 삭제 시도
		try {
			await fs.unlink(uploadRecord.filePath);
		} catch (err) {
			console.warn(`파일 삭제 실패 (이미 없을 수 있음): ${uploadRecord.filePath}`);
		}

		// DB 기록 삭제
		await UploadHistory.findByIdAndDelete(id);

		return json({ success: true });
	} catch (err) {
		console.error('Delete upload error:', err);
		return json({ error: '삭제 중 오류가 발생했습니다.' }, { status: 500 });
	}
}
