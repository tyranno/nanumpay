import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import UploadHistory from '$lib/server/models/UploadHistory.js';
import zlib from 'zlib';
import { promisify } from 'util';

const gunzip = promisify(zlib.gunzip);

/**
 * GET: 파일 다운로드 (특정 업로드 ID)
 * - DB에서 fileData 우선 조회
 * - fileData 없으면 filePath에서 읽기 (레거시)
 */
export async function GET({ params, locals }) {
	// 관리자 권한 확인
	if (!locals.user || !locals.user.isAdmin) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	await db();

	try {
		const record = await UploadHistory.findById(params.id);
		if (!record) {
			return json({ error: '파일을 찾을 수 없습니다.' }, { status: 404 });
		}

		let fileBuffer;

		// 1. DB에 fileData가 있으면 사용
		if (record.fileData) {
			fileBuffer = await gunzip(record.fileData);
		}
		// 2. fileData가 없으면 filePath에서 읽기 (레거시)
		else if (record.filePath) {
			try {
				const fs = await import('fs/promises');
				const compressedData = await fs.readFile(record.filePath);
				fileBuffer = await gunzip(compressedData);
			} catch (error) {
				console.error('파일 읽기 실패:', error);
				return json({ error: '파일을 읽을 수 없습니다.' }, { status: 404 });
			}
		}
		// 3. 둘 다 없으면 에러
		else {
			return json({ error: '파일 데이터가 없습니다.' }, { status: 404 });
		}

		// 파일 다운로드 응답
		return new Response(fileBuffer, {
			status: 200,
			headers: {
				'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				'Content-Disposition': `attachment; filename="${encodeURIComponent(record.originalFileName)}"`,
				'Content-Length': fileBuffer.length.toString()
			}
		});
	} catch (error) {
		console.error('Download error:', error);
		return json({ error: '다운로드 중 오류가 발생했습니다.' }, { status: 500 });
	}
}

/**
 * DELETE: 업로드 히스토리 삭제
 */
export async function DELETE({ params, locals }) {
	// 관리자 권한 확인
	if (!locals.user || !locals.user.isAdmin) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	await db();

	try {
		const record = await UploadHistory.findById(params.id);
		if (!record) {
			return json({ error: '파일을 찾을 수 없습니다.' }, { status: 404 });
		}

		// 파일 시스템에 파일이 있으면 삭제 (레거시)
		if (record.filePath) {
			try {
				const fs = await import('fs/promises');
				await fs.unlink(record.filePath);
				console.log(`📁 파일 시스템에서 삭제: ${record.filePath}`);
			} catch (error) {
				// 파일이 이미 없어도 계속 진행
				console.warn('파일 삭제 실패 (무시):', error.message);
			}
		}

		// DB 레코드 삭제
		await UploadHistory.findByIdAndDelete(params.id);

		console.log(`🗑️  업로드 히스토리 삭제: ${record.originalFileName} (ID: ${params.id})`);

		return json({ success: true });
	} catch (error) {
		console.error('Delete error:', error);
		return json({ error: '삭제 중 오류가 발생했습니다.' }, { status: 500 });
	}
}
