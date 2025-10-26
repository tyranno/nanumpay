import ExcelJS from 'exceljs';
import FileSaver from 'file-saver';

const { saveAs } = FileSaver;

/**
 * 설계사 수당 지급명부 Excel 내보내기 유틸리티
 */
export class PlannerCommissionExcelExporter {
	constructor(options = {}) {
		this.showPhoneColumn = options.showPhoneColumn ?? false;
		this.showUserCountColumn = options.showUserCountColumn ?? false;
		this.showRevenueColumn = options.showRevenueColumn ?? false;
		this.filterType = options.filterType || 'month';
		this.selectedMonth = options.selectedMonth;
		this.startYear = options.startYear;
		this.startMonth = options.startMonth;
		this.endYear = options.endYear;
		this.endMonth = options.endMonth;
		this.plannerName = options.plannerName || '';
	}

	/**
	 * Excel 파일 생성 및 다운로드
	 */
	async export(allData, months, monthlyTotals) {
		if (!allData || allData.length === 0) {
			alert('다운로드할 데이터가 없습니다.');
			return;
		}

		const workbook = new ExcelJS.Workbook();
		const worksheet = workbook.addWorksheet('설계사 수당 지급명부');

		// 컬럼 수 계산
		const colsPerMonth = 1 + (this.showUserCountColumn ? 1 : 0) + (this.showRevenueColumn ? 1 : 0);
		const fixedCols = 2 + (this.showPhoneColumn ? 1 : 0); // 순번, 설계사, (연락처)
		const totalCols = fixedCols + months.length * colsPerMonth;

		// 헤더 정보 생성
		const periodInfo = this.getPeriodInfo();
		const searchInfo = this.getSearchInfo();
		const totalSummary = this.calculateTotalSummary(monthlyTotals);

		// Excel 시트 구성
		this.addTitle(worksheet, totalCols);
		this.addEmptyRow(worksheet);
		this.addInfoRows(worksheet, periodInfo, searchInfo, totalSummary, allData.length);
		this.addEmptyRow(worksheet);

		const { headerRow1, headerRow2 } = this.addTableHeaders(worksheet, months, totalCols);
		this.addDataRows(worksheet, allData, months);
		this.addTotalRow(worksheet, months, monthlyTotals, totalCols);

		this.applyTableBorders(worksheet, headerRow1.number, worksheet.lastRow.number, totalCols);
		this.setColumnWidths(worksheet, totalCols);

		// 파일 다운로드
		await this.downloadFile(workbook);
	}

	/**
	 * 조회 기간 정보 생성
	 */
	getPeriodInfo() {
		if (this.filterType === 'month') {
			return `${this.selectedMonth} (단일 월)`;
		} else {
			return `${this.startYear}년 ${this.startMonth}월 ~ ${this.endYear}년 ${this.endMonth}월`;
		}
	}

	/**
	 * 검색 정보 생성
	 */
	getSearchInfo() {
		return this.plannerName ? `설계사: ${this.plannerName}` : '전체';
	}

	/**
	 * 전체 합계 계산
	 */
	calculateTotalSummary(monthlyTotals) {
		let totalCommission = 0;
		let totalUsers = 0;
		let totalRevenue = 0;

		Object.values(monthlyTotals).forEach(monthTotal => {
			totalCommission += monthTotal.totalCommission || 0;
			totalUsers += monthTotal.totalUsers || 0;
			totalRevenue += monthTotal.totalRevenue || 0;
		});

		return { totalCommission, totalUsers, totalRevenue };
	}

	/**
	 * 제목 행 추가
	 */
	addTitle(worksheet, totalCols) {
		const titleRow = worksheet.addRow(['설계사 수당 지급명부']);
		worksheet.mergeCells(titleRow.number, 1, titleRow.number, totalCols);
		titleRow.font = { size: 16, bold: true };
		titleRow.alignment = { horizontal: 'center', vertical: 'middle' };
		titleRow.height = 30;
	}

	/**
	 * 빈 행 추가
	 */
	addEmptyRow(worksheet) {
		worksheet.addRow([]);
	}

	/**
	 * 정보 행 추가
	 */
	addInfoRows(worksheet, periodInfo, searchInfo, totalSummary, dataCount) {
		// 조회 기간
		const periodRow = worksheet.addRow(['조회 기간', periodInfo]);
		periodRow.font = { bold: true };

		// 검색 조건
		const searchRow = worksheet.addRow(['검색 조건', searchInfo]);
		searchRow.font = { bold: true };

		// 설계사 수
		const plannerRow = worksheet.addRow(['총 설계사', `${dataCount}명`]);
		plannerRow.font = { bold: true };

		// 총 지급액
		const commissionRow = worksheet.addRow(['총 수당', this.formatAmount(totalSummary.totalCommission) + '원']);
		commissionRow.font = { bold: true };

		if (this.showUserCountColumn) {
			const usersRow = worksheet.addRow(['총 용역자', `${totalSummary.totalUsers}명`]);
			usersRow.font = { bold: true };
		}

		if (this.showRevenueColumn) {
			const revenueRow = worksheet.addRow(['총 매출', this.formatAmount(totalSummary.totalRevenue) + '원']);
			revenueRow.font = { bold: true };
		}
	}

	/**
	 * 테이블 헤더 추가
	 */
	addTableHeaders(worksheet, months, totalCols) {
		const colsPerMonth = 1 + (this.showUserCountColumn ? 1 : 0) + (this.showRevenueColumn ? 1 : 0);

		// 월별 배경색 정의
		const monthColors = [
			'FFE8F4F8', // 연한 파랑
			'FFF4E8F8', // 연한 보라
			'FFE8F8F0', // 연한 초록
			'FFF8F4E8', // 연한 주황
			'FFF0E8F8', // 연한 분홍
			'FFE8F8E8', // 연한 민트
		];

		// 헤더 1행 생성 (아직 추가 안 함)
		const header1Cells = [];

		// 순번, 설계사
		header1Cells.push({
			value: '순번',
			fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } }
		});
		header1Cells.push({
			value: '설계사',
			fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } }
		});
		// 연락처 (선택적)
		if (this.showPhoneColumn) {
			header1Cells.push({
				value: '연락처',
				fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } }
			});
		}

		// 월별 헤더
		months.forEach((month, monthIndex) => {
			const color = monthColors[monthIndex % monthColors.length];
			header1Cells.push({
				value: month,
				fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }
			});
			// 병합을 위한 빈 셀
			for (let i = 1; i < colsPerMonth; i++) {
				header1Cells.push({
					value: '',
					fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }
				});
			}
		});

		// 헤더 2행 생성 (아직 추가 안 함)
		const header2Cells = [];

		// 빈 셀 (순번, 설계사, (연락처)는 병합됨)
		const fixedColsCount = 2 + (this.showPhoneColumn ? 1 : 0);
		for (let i = 0; i < fixedColsCount; i++) {
			header2Cells.push({
				value: '',
				fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } }
			});
		}

		// 월별 서브 헤더
		months.forEach((month, monthIndex) => {
			const color = monthColors[monthIndex % monthColors.length];
			header2Cells.push({
				value: '지급액',
				fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }
			});
			if (this.showUserCountColumn) {
				header2Cells.push({
					value: '등록인원',
					fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }
				});
			}
			if (this.showRevenueColumn) {
				header2Cells.push({
					value: '매출금',
					fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }
				});
			}
		});

		// 헤더 1행 추가 (필요한 컬럼 수만큼만)
		const row1Values = header1Cells.map(c => c.value);
		const headerRow1 = worksheet.addRow(row1Values);
		headerRow1.font = { bold: true, size: 11 };
		headerRow1.alignment = { horizontal: 'center', vertical: 'middle' };
		headerRow1.height = 20;

		// 헤더 1행 스타일 적용 (컬럼 수만큼만)
		for (let i = 0; i < header1Cells.length; i++) {
			headerRow1.getCell(i + 1).fill = header1Cells[i].fill;
		}

		// 헤더 2행 추가 (필요한 컬럼 수만큼만)
		const row2Values = header2Cells.map(c => c.value);
		const headerRow2 = worksheet.addRow(row2Values);
		headerRow2.font = { bold: true, size: 10 };
		headerRow2.alignment = { horizontal: 'center', vertical: 'middle' };
		headerRow2.height = 18;

		// 헤더 2행 스타일 적용 (컬럼 수만큼만)
		for (let i = 0; i < header2Cells.length; i++) {
			headerRow2.getCell(i + 1).fill = header2Cells[i].fill;
		}

		// 셀 병합
		// 순번, 설계사, (연락처) (세로 병합)
		worksheet.mergeCells(headerRow1.number, 1, headerRow2.number, 1); // 순번
		worksheet.mergeCells(headerRow1.number, 2, headerRow2.number, 2); // 설계사
		if (this.showPhoneColumn) {
			worksheet.mergeCells(headerRow1.number, 3, headerRow2.number, 3); // 연락처
		}

		// 월별 병합 (가로 병합 - colsPerMonth > 1일 때만)
		if (colsPerMonth > 1) {
			const fixedCols = 2 + (this.showPhoneColumn ? 1 : 0);
			let colIndex = fixedCols + 1;
			months.forEach(() => {
				worksheet.mergeCells(headerRow1.number, colIndex, headerRow1.number, colIndex + colsPerMonth - 1);
				colIndex += colsPerMonth;
			});
		}

		return { headerRow1, headerRow2 };
	}

	/**
	 * 데이터 행 추가
	 */
	addDataRows(worksheet, allData, months) {
		allData.forEach((planner, index) => {
			const row = [
				index + 1,
				planner.plannerName
			];

			// 연락처 (선택적)
			if (this.showPhoneColumn) {
				row.push(planner.plannerAccountId?.phone || '-');
			}

			months.forEach(month => {
				const monthData = planner.months[month];
				row.push(monthData ? monthData.totalCommission : 0);
				if (this.showUserCountColumn) {
					row.push(monthData ? monthData.totalUsers : 0);
				}
				if (this.showRevenueColumn) {
					row.push(monthData ? monthData.totalRevenue : 0);
				}
			});

			const dataRow = worksheet.addRow(row);
			dataRow.alignment = { horizontal: 'center', vertical: 'middle' };

			// 숫자 셀에 숫자 포맷 적용
			let colIndex = 4;
			months.forEach(() => {
				dataRow.getCell(colIndex).numFmt = '#,##0'; // 지급액
				colIndex++;
				if (this.showUserCountColumn) {
					dataRow.getCell(colIndex).numFmt = '#,##0'; // 등록인원
					colIndex++;
				}
				if (this.showRevenueColumn) {
					dataRow.getCell(colIndex).numFmt = '#,##0'; // 매출금
					colIndex++;
				}
			});
		});
	}

	/**
	 * 총계 행 추가
	 */
	addTotalRow(worksheet, months, monthlyTotals, totalCols) {
		// 총계 행 데이터 생성
		const row = ['총계', '']; // 순번, 설계사

		// 연락처 (선택적)
		if (this.showPhoneColumn) {
			row.push('');
		}

		months.forEach(month => {
			const monthTotal = monthlyTotals[month] || { totalCommission: 0, totalUsers: 0, totalRevenue: 0 };
			row.push(monthTotal.totalCommission);
			if (this.showUserCountColumn) {
				row.push(monthTotal.totalUsers);
			}
			if (this.showRevenueColumn) {
				row.push(monthTotal.totalRevenue);
			}
		});

		// 행 추가
		const totalRow = worksheet.addRow(row);
		totalRow.font = { bold: true };
		totalRow.alignment = { horizontal: 'center', vertical: 'middle' };

		// 총계 라벨 병합 (순번 + 설계사 + (연락처))
		const fixedCols = 2 + (this.showPhoneColumn ? 1 : 0);
		worksheet.mergeCells(totalRow.number, 1, totalRow.number, fixedCols);

		// 병합된 셀에 배경색 적용
		totalRow.getCell(1).fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: 'FFFFF0C0' }
		};

		// 월별 데이터 셀에만 배경색 및 숫자 포맷 적용
		const fixedColsCount = 2 + (this.showPhoneColumn ? 1 : 0);
		let colIndex = fixedColsCount + 1;
		months.forEach(() => {
			// 지급액
			const cell = totalRow.getCell(colIndex);
			cell.numFmt = '#,##0';
			cell.fill = {
				type: 'pattern',
				pattern: 'solid',
				fgColor: { argb: 'FFFFF0C0' }
			};
			colIndex++;

			// 등록인원
			if (this.showUserCountColumn) {
				const userCell = totalRow.getCell(colIndex);
				userCell.numFmt = '#,##0';
				userCell.fill = {
					type: 'pattern',
					pattern: 'solid',
					fgColor: { argb: 'FFFFF0C0' }
				};
				colIndex++;
			}

			// 매출금
			if (this.showRevenueColumn) {
				const revenueCell = totalRow.getCell(colIndex);
				revenueCell.numFmt = '#,##0';
				revenueCell.fill = {
					type: 'pattern',
					pattern: 'solid',
					fgColor: { argb: 'FFFFF0C0' }
				};
				colIndex++;
			}
		});
	}

	/**
	 * 테이블 테두리 적용
	 */
	applyTableBorders(worksheet, startRow, endRow, totalCols) {
		const borderStyle = {
			top: { style: 'thin' },
			left: { style: 'thin' },
			bottom: { style: 'thin' },
			right: { style: 'thin' }
		};

		for (let row = startRow; row <= endRow; row++) {
			for (let col = 1; col <= totalCols; col++) {
				const cell = worksheet.getRow(row).getCell(col);
				cell.border = borderStyle;
			}
		}
	}

	/**
	 * 컬럼 너비 설정
	 */
	setColumnWidths(worksheet, totalCols) {
		// 정확히 totalCols만큼만 설정
		const colWidths = [
			8,  // 순번
			15, // 설계사
			15  // 연락처
		];

		// 월별 컬럼 너비 추가
		const remainingCols = totalCols - 3;
		for (let i = 0; i < remainingCols; i++) {
			colWidths.push(12);
		}

		// 컬럼 너비 일괄 적용
		worksheet.columns = colWidths.map(width => ({ width }));
	}

	/**
	 * 파일 다운로드
	 */
	async downloadFile(workbook) {
		const buffer = await workbook.xlsx.writeBuffer();
		const blob = new Blob([buffer], {
			type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
		});

		const fileName = `설계사_수당_지급명부_${new Date().toISOString().split('T')[0]}.xlsx`;
		saveAs(blob, fileName);
	}

	/**
	 * 금액 포맷
	 */
	formatAmount(amount) {
		if (!amount && amount !== 0) return '-';
		return amount.toLocaleString();
	}
}
