import ExcelJS from 'exceljs';
import FileSaver from 'file-saver';
import { getWeekOfMonthByFriday } from './fridayWeekCalculator.js';

const { saveAs } = FileSaver;

/**
 * 용역비 지급명부 Excel 내보내기 유틸리티
 */
export class PaymentExcelExporter {
	constructor(options = {}) {
		this.showGradeInfoColumn = options.showGradeInfoColumn ?? true; // ⭐ 등급(회수) 컬럼
		this.showTaxColumn = options.showTaxColumn ?? true;
		this.showNetColumn = options.showNetColumn ?? true;
		this.filterType = options.filterType || 'date';
		this.selectedDate = options.selectedDate;
		this.startYear = options.startYear;
		this.startMonth = options.startMonth;
		this.endYear = options.endYear;
		this.endMonth = options.endMonth;
		this.periodType = options.periodType || 'weekly';
		this.searchQuery = options.searchQuery || '';
		this.searchCategory = options.searchCategory || 'name';
		this.plannerName = options.plannerName || ''; // 설계사 이름
		this.isPlanner = options.isPlanner || false; // 설계사 모드 여부
	}

	/**
	 * Excel 파일 생성 및 다운로드
	 */
	async export(allData, allWeeks) {
		if (!allData || allData.length === 0) {
			alert('다운로드할 데이터가 없습니다.');
			return;
		}

		const workbook = new ExcelJS.Workbook();
		const worksheet = workbook.addWorksheet('용역비 지급명부');

		// 컬럼 수 계산
		const colsPerWeek = (this.showGradeInfoColumn ? 1 : 0) + 1 + (this.showTaxColumn ? 1 : 0) + (this.showNetColumn ? 1 : 0);
		const periodTotalCols = this.filterType === 'period' ? (1 + (this.showTaxColumn ? 1 : 0) + (this.showNetColumn ? 1 : 0)) : 0; // 기간 합계 컬럼 (등급(회수) 제외)
		const fixedCols = this.isPlanner ? 4 : 5; // 설계사 모드일 때 4개, 아닐 때 5개
		const totalCols = fixedCols + periodTotalCols + allWeeks.length * colsPerWeek;

		// 헤더 정보 생성
		const periodInfo = this.getPeriodInfo();
		const searchInfo = this.getSearchInfo();
		const totalSummary = this.calculateTotalSummary(allData, allWeeks);

		// Excel 시트 구성
		this.addTitle(worksheet, totalCols);
		this.addEmptyRow(worksheet);
		this.addInfoRows(worksheet, periodInfo, searchInfo, totalSummary, allData.length);
		this.addEmptyRow(worksheet);

		const { headerRow1, headerRow2 } = this.addTableHeaders(worksheet, allWeeks, totalCols);
		this.addDataRows(worksheet, allData, allWeeks);
		this.addTotalRows(worksheet, allData, allWeeks, totalSummary, totalCols);

		this.applyTableBorders(worksheet, headerRow1.number, worksheet.lastRow.number, totalCols);
		this.setColumnWidths(worksheet, totalCols);

		// 파일 다운로드
		await this.downloadFile(workbook);
	}

	/**
	 * 조회 기간 정보 생성
	 */
	getPeriodInfo() {
		if (this.filterType === 'date') {
			const date = new Date(this.selectedDate);
			const weekInfo = getWeekOfMonthByFriday(date);
			return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${weekInfo.week}주차 (${this.selectedDate})`;
		} else {
			return `${this.startYear}년 ${this.startMonth}월 ~ ${this.endYear}년 ${this.endMonth}월 (${this.periodType === 'weekly' ? '주간' : '월간'} 표시)`;
		}
	}

	/**
	 * 검색 정보 생성
	 */
	getSearchInfo() {
		return this.searchQuery
			? `${this.searchCategory === 'name' ? '이름' : '설계자'}: ${this.searchQuery}`
			: '전체';
	}

	/**
	 * 전체 합계 계산
	 */
	calculateTotalSummary(allData, allWeeks) {
		let totalSummary = { amount: 0, tax: 0, net: 0 };

		allWeeks.forEach(week => {
			const total = this.calculateWeekTotal(allData, week);
			totalSummary.amount += total.amount;
			totalSummary.tax += total.tax;
			totalSummary.net += total.net;
		});

		return totalSummary;
	}

	/**
	 * 주차별 합계 계산
	 */
	calculateWeekTotal(data, week) {
		const key = this.getPaymentKey(week);
		let total = { amount: 0, tax: 0, net: 0 };

		data.forEach(user => {
			const payment = user.payments[key];
			if (payment) {
				total.amount += payment.amount || 0;
				total.tax += payment.tax || 0;
				total.net += payment.net || 0;
			}
		});

		return total;
	}

	/**
	 * 지급 키 생성
	 */
	getPaymentKey(week) {
		if (this.filterType === 'period' && this.periodType === 'monthly') {
			return `${week.year}_${week.month}`;
		}
		return `${week.year}_${week.month}_${week.week}`;
	}

	/**
	 * 제목 행 추가
	 */
	addTitle(worksheet, totalCols) {
		const titleRow = worksheet.addRow(['용역비 지급명부']);
		worksheet.mergeCells(1, 1, 1, totalCols);
		titleRow.height = 30;
		titleRow.getCell(1).font = { bold: true, size: 16, color: { argb: 'FF1F4788' } };
		titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3F2FD' } };
		titleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
	}

	/**
	 * 빈 행 추가
	 */
	addEmptyRow(worksheet) {
		worksheet.addRow([]);
	}

	/**
	 * 정보 행들 추가
	 */
	addInfoRows(worksheet, periodInfo, searchInfo, totalSummary, userCount) {
		// 설계사 모드일 때
		if (this.isPlanner && this.plannerName) {
			const plannerRow = worksheet.addRow(['설계사:', this.plannerName]);
			this.styleInfoCell(plannerRow.getCell(1));
			plannerRow.getCell(2).alignment = { vertical: 'middle', horizontal: 'left' };
			plannerRow.getCell(2).font = { bold: true, size: 11 };
		}
		
		// 조회 기간
		const periodRow = worksheet.addRow(['조회 기간:', periodInfo]);
		this.styleInfoCell(periodRow.getCell(1));
		periodRow.getCell(2).alignment = { vertical: 'middle', horizontal: 'left' };

		// 검색 조건 (설계사 모드가 아닐 때만)
		if (!this.isPlanner) {
			const searchRow = worksheet.addRow(['검색 조건:', searchInfo]);
			this.styleInfoCell(searchRow.getCell(1));
			searchRow.getCell(2).alignment = { vertical: 'middle', horizontal: 'left' };
		}

		// 총액 정보
		const summaryRow = worksheet.addRow([
			'총 지급액:', `${totalSummary.amount.toLocaleString()}원`, '',
			'총 원천징수:', `${totalSummary.tax.toLocaleString()}원`, '',
			'총 실지급액:', `${totalSummary.net.toLocaleString()}원`
		]);
		[1, 4, 7].forEach(col => {
			summaryRow.getCell(col).font = { bold: true, size: 11 };
			summaryRow.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3E0' } };
			this.addBorder(summaryRow.getCell(col));
		});
		[2, 5, 8].forEach(col => {
			summaryRow.getCell(col).font = { bold: true, size: 12, color: { argb: 'FFE65100' } };
			summaryRow.getCell(col).alignment = { vertical: 'middle', horizontal: 'right' };
		});

		// 지급 대상
		const targetRow = worksheet.addRow(['지급 대상:', `${userCount}명`]);
		this.styleInfoCell(targetRow.getCell(1));
		targetRow.getCell(2).alignment = { vertical: 'middle', horizontal: 'left' };
	}

	/**
	 * 정보 셀 스타일 적용
	 */
	styleInfoCell(cell) {
		cell.font = { bold: true, size: 11 };
		cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
		this.addBorder(cell);
	}

	/**
	 * 테두리 추가
	 */
	addBorder(cell) {
		cell.border = {
			top: { style: 'thin', color: { argb: 'FFDDDDDD' } },
			bottom: { style: 'thin', color: { argb: 'FFDDDDDD' } },
			left: { style: 'thin', color: { argb: 'FFDDDDDD' } },
			right: { style: 'thin', color: { argb: 'FFDDDDDD' } }
		};
	}

	/**
	 * 테이블 헤더 추가
	 */
	addTableHeaders(worksheet, allWeeks, totalCols) {
		// 헤더 1행 (주차 정보)
		// 설계사 모드일 때는 "설계자" 컬럼 제외
		const headerRow1Data = this.isPlanner
			? ['순번', '성명', '은행', '계좌번호']
			: ['순번', '성명', '설계자', '은행', '계좌번호'];
		const colsPerWeek = (this.showGradeInfoColumn ? 1 : 0) + 1 + (this.showTaxColumn ? 1 : 0) + (this.showNetColumn ? 1 : 0);

		// 기간 조회일 때만 기간 합계 컬럼 추가
		if (this.filterType === 'period') {
			headerRow1Data.push('기간 합계');
			for (let i = 1; i < colsPerWeek; i++) {
				headerRow1Data.push('');
			}
		}

		allWeeks.forEach(week => {
			headerRow1Data.push(week.label);
			for (let i = 1; i < colsPerWeek; i++) {
				headerRow1Data.push('');
			}
		});

		const headerRow1 = worksheet.addRow(headerRow1Data);
		headerRow1.height = 25;

		// 헤더 1행 스타일
		for (let i = 1; i <= totalCols; i++) {
			headerRow1.getCell(i).font = { bold: true };
			headerRow1.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };
			headerRow1.getCell(i).alignment = { vertical: 'middle', horizontal: 'center' };
		}

		// 헤더 2행 (세부 항목)
		// 설계사 모드일 때는 "설계자" 컬럼 제외 (4개 항목)
		const headerRow2Data = this.isPlanner
			? ['', '', '', '']
			: ['', '', '', '', ''];

		// 기간 조회일 때만 기간 합계 상세 항목 추가
		if (this.filterType === 'period') {
			headerRow2Data.push('지급액');
			if (this.showTaxColumn) {
				headerRow2Data.push('원천징수(3.3%)');
			}
			if (this.showNetColumn) {
				headerRow2Data.push('실지급액');
			}
		}

		allWeeks.forEach(() => {
			headerRow2Data.push('지급액');
			if (this.showGradeInfoColumn) {
				headerRow2Data.push('등급(회수)');
			}
			if (this.showTaxColumn) {
				headerRow2Data.push('원천징수(3.3%)');
			}
			if (this.showNetColumn) {
				headerRow2Data.push('실지급액');
			}
		});

		const headerRow2 = worksheet.addRow(headerRow2Data);

		// 헤더 2행 스타일
		const fixedColCount = this.isPlanner ? 4 : 5; // 설계사 모드일 때 4개, 아닐 때 5개
		for (let i = fixedColCount + 1; i <= totalCols; i++) {
			headerRow2.getCell(i).font = { bold: true };
			headerRow2.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };
			headerRow2.getCell(i).alignment = { vertical: 'middle', horizontal: 'center' };
		}

		// 고정 컬럼 병합
		for (let i = 1; i <= fixedColCount; i++) {
			worksheet.mergeCells(headerRow1.number, i, headerRow2.number, i);
		}

		// 주차 헤더 병합
		let colStart = fixedColCount + 1;
		allWeeks.forEach(() => {
			worksheet.mergeCells(headerRow1.number, colStart, headerRow1.number, colStart + colsPerWeek - 1);
			for (let c = colStart; c < colStart + colsPerWeek; c++) {
				headerRow1.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD0E0F0' } };
			}
			colStart += colsPerWeek;
		});

		return { headerRow1, headerRow2 };
	}

	/**
	 * 데이터 행 추가
	 */
	addDataRows(worksheet, allData, allWeeks) {
		allData.forEach(user => {
			// 설계사 모드일 때는 "설계자" 컬럼 제외
			const rowData = this.isPlanner
				? [
					user.no,
					user.name,
					user.bank || '',
					user.accountNumber || ''
				]
				: [
					user.no,
					user.name,
					user.planner || '',
					user.bank || '',
					user.accountNumber || ''
				];

			// 기간 조회일 때 개인별 총액 추가
			if (this.filterType === 'period') {
				let userTotal = { amount: 0, tax: 0, net: 0 };
				allWeeks.forEach(week => {
					const key = this.getPaymentKey(week);
					const payment = user.payments[key];
					if (payment) {
						userTotal.amount += payment.amount || 0;
						userTotal.tax += payment.tax || 0;
						userTotal.net += payment.net || 0;
					}
				});

				rowData.push(userTotal.amount);
				if (this.showTaxColumn) {
					rowData.push(userTotal.tax);
				}
				if (this.showNetColumn) {
					rowData.push(userTotal.net);
				}
			}

			allWeeks.forEach(week => {
				const key = this.getPaymentKey(week);
				const payment = user.payments[key];

				rowData.push(payment?.amount || 0);
				if (this.showGradeInfoColumn) {
					rowData.push(payment?.gradeInfo || '-');
				}
				if (this.showTaxColumn) {
					rowData.push(payment?.tax || 0);
				}
				if (this.showNetColumn) {
					rowData.push(payment?.net || 0);
				}
			});

			const dataRow = worksheet.addRow(rowData);
			dataRow.alignment = { vertical: 'middle', horizontal: 'center' };

			// 금액 컬럼 스타일
			this.styleDataRow(dataRow, allWeeks.length);
		});
	}

	/**
	 * 데이터 행 스타일 적용
	 */
	styleDataRow(dataRow, weekCount) {
		// 설계사 모드일 때는 5번째 컬럼부터, 아닐 때는 6번째 컬럼부터
		let col = this.isPlanner ? 5 : 6;
		
		// 기간 합계 컬럼 스타일 (filterType === 'period'일 때)
		if (this.filterType === 'period') {
			// 지급액
			dataRow.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE1BEE7' } };
			dataRow.getCell(col).font = { bold: true };
			dataRow.getCell(col).numFmt = '#,##0';
			dataRow.getCell(col).alignment = { vertical: 'middle', horizontal: 'right' };
			col++;

			// 원천징수
			if (this.showTaxColumn) {
				dataRow.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEEEE' } };
				dataRow.getCell(col).font = { color: { argb: 'FFD9534F' } };
				dataRow.getCell(col).numFmt = '#,##0';
				dataRow.getCell(col).alignment = { vertical: 'middle', horizontal: 'right' };
				col++;
			}

			// 실지급액
			if (this.showNetColumn) {
				dataRow.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };
				dataRow.getCell(col).numFmt = '#,##0';
				dataRow.getCell(col).alignment = { vertical: 'middle', horizontal: 'right' };
				col++;
			}
		}
		
		// 주차별 컬럼 스타일
		for (let w = 0; w < weekCount; w++) {
			// 지급액
			dataRow.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFCC' } };
			dataRow.getCell(col).font = { bold: true };
			dataRow.getCell(col).numFmt = '#,##0';
			dataRow.getCell(col).alignment = { vertical: 'middle', horizontal: 'right' };
			col++;
			
			// 등급(회수)
			if (this.showGradeInfoColumn) {
				dataRow.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3F2FD' } }; // 연한 파란색
				dataRow.getCell(col).font = { size: 10 };
				dataRow.getCell(col).alignment = { vertical: 'middle', horizontal: 'center' };
				col++;
			}

			// 원천징수
			if (this.showTaxColumn) {
				dataRow.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEEEE' } };
				dataRow.getCell(col).font = { color: { argb: 'FFD9534F' } };
				dataRow.getCell(col).numFmt = '#,##0';
				dataRow.getCell(col).alignment = { vertical: 'middle', horizontal: 'right' };
				col++;
			}

			// 실지급액
			if (this.showNetColumn) {
				dataRow.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };
				dataRow.getCell(col).numFmt = '#,##0';
				dataRow.getCell(col).alignment = { vertical: 'middle', horizontal: 'right' };
				col++;
			}
		}
	}

	/**
	 * 합계 행 추가
	 */
	addTotalRows(worksheet, allData, allWeeks, totalSummary, totalCols) {
		// 합계 행 ("총금액")
		// 설계사 모드일 때는 "설계자" 컬럼 제외
		const totalRowData = this.isPlanner
			? ['', '', '', '총금액']
			: ['', '', '', '', '총금액'];
		
		// 기간 합계 컬럼 추가 (filterType === 'period'일 때)
		if (this.filterType === 'period') {
			totalRowData.push(totalSummary.amount);
			if (this.showTaxColumn) {
				totalRowData.push(totalSummary.tax);
			}
			if (this.showNetColumn) {
				totalRowData.push(totalSummary.net);
			}
		}
		
		// 주차별 합계 추가
		allWeeks.forEach(week => {
			const total = this.calculateWeekTotal(allData, week);
			totalRowData.push(total.amount);
			if (this.showGradeInfoColumn) {
				totalRowData.push('-'); // 등급(회수)는 총계에서 '-' 표시
			}
			if (this.showTaxColumn) {
				totalRowData.push(total.tax);
			}
			if (this.showNetColumn) {
				totalRowData.push(total.net);
			}
		});

		const totalRow = worksheet.addRow(totalRowData);
		const fixedColCount = this.isPlanner ? 4 : 5;

		// 총금액 행 스타일 (보라색 배경, 굵은 글씨)
		for (let i = 1; i <= totalCols; i++) {
			totalRow.getCell(i).font = { bold: true, size: 11 };
			totalRow.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE1BEE7' } };
			totalRow.getCell(i).alignment = { vertical: 'middle', horizontal: 'center' };
		}
		// 금액 컬럼은 오른쪽 정렬 및 숫자 포맷
		for (let i = fixedColCount + 1; i <= totalCols; i++) {
			totalRow.getCell(i).numFmt = '#,##0';
			totalRow.getCell(i).alignment = { vertical: 'middle', horizontal: 'right' };
		}


	}

	/**
	 * 테이블 테두리 적용
	 */
	applyTableBorders(worksheet, startRow, endRow, totalCols) {
		for (let r = startRow; r <= endRow; r++) {
			for (let c = 1; c <= totalCols; c++) {
				const cell = worksheet.getRow(r).getCell(c);
				cell.border = {
					top: { style: 'thin', color: { argb: 'FF000000' } },
					bottom: { style: 'thin', color: { argb: 'FF000000' } },
					left: { style: 'thin', color: { argb: 'FF000000' } },
					right: { style: 'thin', color: { argb: 'FF000000' } }
				};
			}
		}
	}

	/**
	 * 컬럼 너비 설정
	 */
	setColumnWidths(worksheet, totalCols) {
		if (this.isPlanner) {
			// 설계사 모드: 순번, 성명, 은행, 계좌번호 (4개)
			worksheet.getColumn(1).width = 8;  // 순번
			worksheet.getColumn(2).width = 12; // 성명
			worksheet.getColumn(3).width = 12; // 은행
			worksheet.getColumn(4).width = 18; // 계좌번호
			for (let i = 5; i <= totalCols; i++) {
				worksheet.getColumn(i).width = 14;
			}
		} else {
			// 관리자 모드: 순번, 성명, 설계자, 은행, 계좌번호 (5개)
			worksheet.getColumn(1).width = 8;  // 순번
			worksheet.getColumn(2).width = 12; // 성명
			worksheet.getColumn(3).width = 12; // 설계자
			worksheet.getColumn(4).width = 12; // 은행
			worksheet.getColumn(5).width = 18; // 계좌번호
			for (let i = 6; i <= totalCols; i++) {
				worksheet.getColumn(i).width = 14;
			}
		}
	}

	/**
	 * 파일 다운로드
	 */
	async downloadFile(workbook) {
		const today = new Date();
		const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;

		// 설계사 모드일 때 파일명에 설계사 이름 포함
		const fileName = this.isPlanner && this.plannerName
			? `용역비지급명부_${this.plannerName}_${dateStr}.xlsx`
			: `용역비지급명부_${dateStr}.xlsx`;

		const buffer = await workbook.xlsx.writeBuffer();
		const blob = new Blob([buffer], {
			type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
		});
		saveAs(blob, fileName);
	}
}