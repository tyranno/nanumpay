/**
 * 용역자 등록 엑셀 템플릿 생성 스크립트
 * v8.0: ID 필드 추가 (planner, plannerPhone, idNumber)
 */

import XLSX from 'xlsx';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 예제 데이터
const templateData = [
	{
		등록날짜: '2025-07-09',
		성명: '홍길동',
		연락처: '010-1234-5678',
		주민번호: '750315-1234567',
		은행: '국민은행',
		계좌번호: '123456789012',
		'소속/지사': '서울지사',
		판매인: '사장님',
		'판매인 연락처': '010-9999-9999',
		설계사: '김설계',
		'설계사 연락처': '010-8888-8888',
		보험상품: 'ABC보험',
		보험회사: '대한생명'
	},
	{
		등록날짜: '2025-07-15',
		성명: '김철수',
		연락처: '010-2345-6789',
		주민번호: '820512-1234567',
		은행: '신한은행',
		계좌번호: '234567890123',
		'소속/지사': '부산지사',
		판매인: '홍길동',
		'판매인 연락처': '010-1234-5678',
		설계사: '이설계',
		'설계사 연락처': '010-7777-7777',
		보험상품: 'XYZ보험',
		보험회사: '삼성생명'
	},
	{
		등록날짜: '2025-08-01',
		성명: '이영희',
		연락처: '010-3456-7890',
		주민번호: '900823-2234567',
		은행: '우리은행',
		계좌번호: '345678901234',
		'소속/지사': '대구지사',
		판매인: '김철수',
		'판매인 연락처': '010-2345-6789',
		설계사: '박설계',
		'설계사 연락처': '010-6666-6666',
		보험상품: 'DEF보험',
		보험회사: '한화생명'
	}
];

// 워크북 생성
const workbook = XLSX.utils.book_new();

// 워크시트 생성
const worksheet = XLSX.utils.json_to_sheet(templateData);

// 컬럼 너비 설정
const colWidths = [
	{ wch: 12 },  // 등록날짜
	{ wch: 10 },  // 성명
	{ wch: 15 },  // 연락처
	{ wch: 16 },  // 주민번호
	{ wch: 12 },  // 은행
	{ wch: 16 },  // 계좌번호
	{ wch: 12 },  // 소속/지사
	{ wch: 10 },  // 판매인
	{ wch: 15 },  // 판매인 연락처
	{ wch: 10 },  // 설계사
	{ wch: 15 },  // 설계사 연락처
	{ wch: 12 },  // 보험상품
	{ wch: 12 }   // 보험회사
];

worksheet['!cols'] = colWidths;

// 워크시트를 워크북에 추가
XLSX.utils.book_append_sheet(workbook, worksheet, '용역자등록');

// 파일 저장 경로
const outputPath = join(__dirname, '../apps/web/static/용역자_등록_양식.xlsx');

// 파일 저장
XLSX.writeFile(workbook, outputPath);

console.log('✅ 엑셀 템플릿 생성 완료:', outputPath);
console.log('📋 포함된 예제 데이터:', templateData.length, '건');
