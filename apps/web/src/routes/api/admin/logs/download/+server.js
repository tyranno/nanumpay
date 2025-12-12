/**
 * 로그 파일 다운로드 API
 * 로그 폴더의 모든 파일(.log, .log.gz)을 zip으로 압축하여 다운로드
 * 기간 선택 지원: today, 1week, 1month, 2months, 3months, 6months, all
 */

import archiver from 'archiver';
import fs from 'fs';
import path from 'path';

// 로그 디렉토리 (개발/배포 환경 모두 지원)
// 개발: apps/web/logs/, 배포: /opt/nanumpay/logs/
const logDir = path.join(process.cwd(), 'logs');

/**
 * 파일명에서 날짜 추출 (YYYY-MM-DD 형식)
 * @param {string} filename - 파일명 (예: 2025-12-09.log, 2025-12-09.log.gz)
 * @returns {Date|null} - 날짜 객체 또는 null
 */
function extractDateFromFilename(filename) {
	const match = filename.match(/^(\d{4}-\d{2}-\d{2})/);
	if (match) {
		return new Date(match[1]);
	}
	return null;
}

/**
 * 기간에 따른 시작 날짜 계산
 * @param {string} period - 기간 (today, 1week, 1month, 2months, 3months, 6months, all)
 * @returns {Date|null} - 시작 날짜 또는 null (전체)
 */
function getStartDate(period) {
	const now = new Date();
	now.setHours(0, 0, 0, 0);

	switch (period) {
		case 'today':
			return now;
		case '1week':
			return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
		case '1month':
			return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
		case '2months':
			return new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
		case '3months':
			return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
		case '6months':
			return new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
		case 'all':
		default:
			return null;
	}
}

export async function GET({ locals, url }) {
	// 인증 확인
	if (!locals.user || locals.user.type !== 'admin') {
		return new Response(JSON.stringify({ success: false, message: '인증이 필요합니다.' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	try {
		// 기간 파라미터 가져오기 (기본값: all)
		const period = url.searchParams.get('period') || 'all';
		const startDate = getStartDate(period);

		// 로그 디렉토리 존재 확인
		const logsPath = path.resolve(logDir);

		if (!fs.existsSync(logsPath)) {
			return new Response(JSON.stringify({ success: false, message: '로그 디렉토리가 존재하지 않습니다.' }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		// 로그 파일 목록 가져오기 (.log, .log.gz, .gz 파일만)
		let files = fs.readdirSync(logsPath).filter(file => {
			return file.endsWith('.log') || file.endsWith('.log.gz') || file.endsWith('.gz');
		});

		// 기간 필터링
		if (startDate) {
			files = files.filter(file => {
				const fileDate = extractDateFromFilename(file);
				if (!fileDate) return false;
				return fileDate >= startDate;
			});
		}

		if (files.length === 0) {
			return new Response(JSON.stringify({ success: false, message: '해당 기간에 다운로드할 로그 파일이 없습니다.' }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		// zip 파일 생성
		const archive = archiver('zip', { zlib: { level: 9 } });

		// 스트림으로 응답 생성
		const stream = new ReadableStream({
			start(controller) {
				archive.on('data', (chunk) => {
					controller.enqueue(chunk);
				});

				archive.on('end', () => {
					controller.close();
				});

				archive.on('error', (err) => {
					console.error('Archive error:', err);
					controller.error(err);
				});

				// 파일들을 아카이브에 추가
				for (const file of files) {
					const filePath = path.join(logsPath, file);
					archive.file(filePath, { name: file });
				}

				// 아카이브 완료
				archive.finalize();
			}
		});

		// 파일명에 날짜와 기간 추가
		const now = new Date();
		const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
		const timeStr = now.toTimeString().slice(0, 5).replace(':', '');
		const periodLabel = period === 'all' ? 'all' : period;
		const filename = `nanumpay-logs-${periodLabel}-${dateStr}-${timeStr}.zip`;

		return new Response(stream, {
			status: 200,
			headers: {
				'Content-Type': 'application/zip',
				'Content-Disposition': `attachment; filename="${filename}"`,
				'Cache-Control': 'no-cache'
			}
		});
	} catch (error) {
		console.error('로그 다운로드 오류:', error);
		return new Response(JSON.stringify({
			success: false,
			message: '로그 다운로드 중 오류가 발생했습니다.',
			error: error.message
		}), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
}
