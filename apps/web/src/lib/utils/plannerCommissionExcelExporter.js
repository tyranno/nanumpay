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
		this.viewMode = options.viewMode || 'monthly'; // 'monthly' | 'weekly'

		// 월별/주차별 배경색 정의
		this.monthColors = [
			'FFE8F4F8', // 연한 파랑
			'FFF4E8F8', // 연한 보라
			'FFE8F8F0', // 연한 초록
			'FFF8F4E8', // 연한 주황
			'FFF0E8F8', // 연한 분홍
			'FFE8F8F4'  // 연한 청록
		];
	}

	/**
	 * Excel 파일 생성 및 다운로드
	 */
	async export(allData, periods, periodTotals) {
		if (!allData || allData.length === 0) {
			alert('다운로드할 데이터가 없습니다.');
			return;
		}

		const workbook = new ExcelJS.Workbook();
		const worksheet = workbook.addWorksheet('설계사 지급명부');

		// 컬럼 수 계산
		const colsPerPeriod = 3 + (this.showUserCountColumn ? 1 : 0) + (this.showRevenueColumn ? 1 : 0); // 기간별: 전체총액, 설계총액, 용역총액 (+ 등록인원, 매출금)
		const fixedCols = 2 + (this.showPhoneColumn ? 1 : 0); // 순번, 설계사, (연락처)
		const plannerSummaryCols = 3; // 설계사별 총액: 전체 총액, 설계 총액, 용역 총액
		const totalCols = fixedCols + plannerSummaryCols + periods.length * colsPerPeriod;

		// 헤더 정보 생성
		const periodInfo = this.getPeriodInfo();
		const searchInfo = this.getSearchInfo();
		const totalSummary = this.calculateTotalSummary(periodTotals);

		// Excel 시트 구성
		this.addTitle(worksheet, totalCols);
		this.addEmptyRow(worksheet);
		this.addInfoRows(worksheet, periodInfo, searchInfo, totalSummary, allData.length);
		this.addEmptyRow(worksheet);

		const { headerRow1, headerRow2 } = this.addTableHeaders(worksheet, periods, totalCols);
		this.addDataRows(worksheet, allData, periods);
		this.addTotalRow(worksheet, periods, periodTotals, totalCols);

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
	calculateTotalSummary(periodTotals) {
		let totalAmount = 0;
		let commissionAmount = 0;
		let serviceAmount = 0;
		let totalRevenue = 0;

		Object.values(periodTotals).forEach(periodTotal => {
			totalAmount += periodTotal.totalAmount || 0;
			commissionAmount += periodTotal.commissionAmount || 0;
			serviceAmount += periodTotal.serviceAmount || 0;
			totalRevenue += periodTotal.totalRevenue || 0;
		});

		return { totalAmount, commissionAmount, serviceAmount, totalRevenue };
	}

	/**
	 * 제목 행 추가
	 */
	addTitle(worksheet, totalCols) {
		const titleRow = worksheet.addRow(['설계사 지급명부']);
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

		// 전체 총액
		const totalRow = worksheet.addRow(['전체 총액', this.formatAmount(totalSummary.totalAmount) + '원']);
		totalRow.font = { bold: true };

		// 설계 총액
		const commissionRow = worksheet.addRow(['설계 총액', this.formatAmount(totalSummary.commissionAmount) + '원']);
		commissionRow.font = { bold: true };

		// 용역 총액
		const serviceRow = worksheet.addRow(['용역 총액', this.formatAmount(totalSummary.serviceAmount) + '원']);
		serviceRow.font = { bold: true };

		if (this.showRevenueColumn) {
			const revenueRow = worksheet.addRow(['총 매출', this.formatAmount(totalSummary.totalRevenue) + '원']);
			revenueRow.font = { bold: true };
		}
	}

	/**
	 * 테이블 헤더 추가
	 */
	addTableHeaders(worksheet, periods, totalCols) {
		const colsPerPeriod = 3 + (this.showUserCountColumn ? 1 : 0) + (this.showRevenueColumn ? 1 : 0);

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

		// 설계사별 총액 헤더 (1행에서 2행까지 세로 병합될 컬럼들)
		header1Cells.push({
			value: '전체 총액',
			fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC5E0B4' } } // 연한 초록
		});
		header1Cells.push({
			value: '설계 총액',
			fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE699' } } // 연한 노랑
		});
		header1Cells.push({
			value: '용역 총액',
			fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB4C7E7' } } // 연한 파랑
		});

		// 기간별 헤더
		periods.forEach((period, periodIndex) => {
			const color = this.monthColors[periodIndex % this.monthColors.length];

			// 주차 형식 변환: "2025-08-W1" → "2025-08-01" (금요일 날짜)
			let displayPeriod = period;
			if (period.includes('-W')) {
				const parts = period.split('-');
				const year = parseInt(parts[0]);
				const month = parseInt(parts[1]);
				const week = parseInt(parts[2].replace('W', ''));

				// 해당 월의 첫 번째 금요일 찾기
				const firstDay = new Date(year, month - 1, 1);
				const dayOfWeek = firstDay.getDay();
				const daysUntilFriday = (5 - dayOfWeek + 7) % 7;
				const firstFriday = new Date(year, month - 1, 1 + daysUntilFriday);

				// N주차 금요일 계산
				const targetFriday = new Date(firstFriday);
				targetFriday.setDate(firstFriday.getDate() + (week - 1) * 7);

				const mm = String(targetFriday.getMonth() + 1).padStart(2, '0');
				const dd = String(targetFriday.getDate()).padStart(2, '0');
				displayPeriod = `${targetFriday.getFullYear()}-${mm}-${dd}`;
			}

			header1Cells.push({
				value: displayPeriod,
				fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }
			});
			// 병합을 위한 빈 셀
			for (let i = 1; i < colsPerPeriod; i++) {
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

		// 설계사별 총액 서브 헤더
		header2Cells.push({
			value: '전체 총액',
			fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC5E0B4' } } // 연한 초록
		});
		header2Cells.push({
			value: '설계 총액',
			fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE699' } } // 연한 노랑
		});
		header2Cells.push({
			value: '용역 총액',
			fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB4C7E7' } } // 연한 파랑
		});

		// 기간별 서브 헤더 (전체총액, 설계총액, 용역총액)
		periods.forEach((period, periodIndex) => {
			const baseColor = this.monthColors[periodIndex % this.monthColors.length];

			// 전체총액 - 기본 색상
			header2Cells.push({
				value: '전체총액',
				fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: baseColor } }
			});

			// 설계총액 - 살짝 다른 색상 (노란 톤 추가)
			header2Cells.push({
				value: '설계총액',
				fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: this.blendWithYellow(baseColor) } }
			});

			// 용역총액 - 살짝 다른 색상 (파란 톤 추가)
			header2Cells.push({
				value: '용역총액',
				fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: this.blendWithBlue(baseColor) } }
			});
			if (this.showUserCountColumn) {
				header2Cells.push({
					value: '등록인원',
					fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: baseColor } }
				});
			}
			if (this.showRevenueColumn) {
				header2Cells.push({
					value: '매출금',
					fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: baseColor } }
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

		// 설계사별 총액 각 컬럼을 세로 병합
		const totalSummaryCol = fixedColsCount + 1;
		worksheet.mergeCells(headerRow1.number, totalSummaryCol, headerRow2.number, totalSummaryCol); // 전체 총액
		worksheet.mergeCells(headerRow1.number, totalSummaryCol + 1, headerRow2.number, totalSummaryCol + 1); // 설계 총액
		worksheet.mergeCells(headerRow1.number, totalSummaryCol + 2, headerRow2.number, totalSummaryCol + 2); // 용역 총액

		// 기간별 병합 (가로 병합 - colsPerPeriod > 1일 때만)
		if (colsPerPeriod > 1) {
			const fixedCols = 2 + (this.showPhoneColumn ? 1 : 0) + 3; // 순번, 설계사, (연락처), 설계사별 총액 3개
			let colIndex = fixedCols + 1;
			periods.forEach(() => {
				worksheet.mergeCells(headerRow1.number, colIndex, headerRow1.number, colIndex + colsPerPeriod - 1);
				colIndex += colsPerPeriod;
			});
		}

		return { headerRow1, headerRow2 };
	}

	/**
	 * 데이터 행 추가
	 */
	addDataRows(worksheet, allData, periods) {
		allData.forEach((planner, index) => {
			const row = [
				index + 1,
				planner.plannerName
			];

			// 연락처 (선택적)
			if (this.showPhoneColumn) {
				row.push(planner.plannerAccountId?.phone || '-');
			}

			// 설계사별 총액 계산
			let plannerTotalAmount = 0;
			let plannerCommissionAmount = 0;
			let plannerServiceAmount = 0;

			periods.forEach(period => {
				const periodData = planner.periods[period];
				if (periodData) {
					plannerTotalAmount += periodData.totalAmount || 0;
					plannerCommissionAmount += periodData.commissionAmount || 0;
					plannerServiceAmount += periodData.serviceAmount || 0;
				}
			});

			// 설계사별 총액 추가
			row.push(plannerTotalAmount);
			row.push(plannerCommissionAmount);
			row.push(plannerServiceAmount);

			periods.forEach(period => {
				const periodData = planner.periods[period];
				row.push(periodData ? periodData.totalAmount : 0);
				row.push(periodData ? periodData.commissionAmount : 0);
				row.push(periodData ? periodData.serviceAmount : 0);
				if (this.showUserCountColumn) {
					row.push(periodData ? periodData.totalUsers : 0);
				}
				if (this.showRevenueColumn) {
					row.push(periodData ? periodData.totalRevenue : 0);
				}
			});

			const dataRow = worksheet.addRow(row);
			dataRow.alignment = { horizontal: 'center', vertical: 'middle' };

			// 설계사별 총액 배경색 적용
			const fixedCols = 2 + (this.showPhoneColumn ? 1 : 0);
			const totalSummaryCol = fixedCols + 1;
			
			dataRow.getCell(totalSummaryCol).numFmt = '#,##0'; // 전체 총액
			dataRow.getCell(totalSummaryCol).fill = {
				type: 'pattern',
				pattern: 'solid',
				fgColor: { argb: 'FFE2EFDA' } // 연한 초록
			};

			dataRow.getCell(totalSummaryCol + 1).numFmt = '#,##0'; // 설계 총액
			dataRow.getCell(totalSummaryCol + 1).fill = {
				type: 'pattern',
				pattern: 'solid',
				fgColor: { argb: 'FFFFF2CC' } // 연한 노랑
			};

			dataRow.getCell(totalSummaryCol + 2).numFmt = '#,##0'; // 용역 총액
			dataRow.getCell(totalSummaryCol + 2).fill = {
				type: 'pattern',
				pattern: 'solid',
				fgColor: { argb: 'FFDAE3F3' } // 연한 파랑
			};

			// 기간별 데이터 셀에 숫자 포맷 및 배경색 적용
			let colIndex = totalSummaryCol + 3;
			periods.forEach((period, periodIndex) => {
				const baseColor = this.monthColors[periodIndex % this.monthColors.length];

				// 전체총액 - 기본 색상의 연한 버전
				dataRow.getCell(colIndex).numFmt = '#,##0';
				dataRow.getCell(colIndex).fill = {
					type: 'pattern',
					pattern: 'solid',
					fgColor: { argb: this.lightenColor(baseColor) }
				};
				colIndex++;

				// 설계총액 - 노란 톤 혼합 후 연한 버전
				dataRow.getCell(colIndex).numFmt = '#,##0';
				dataRow.getCell(colIndex).fill = {
					type: 'pattern',
					pattern: 'solid',
					fgColor: { argb: this.lightenColor(this.blendWithYellow(baseColor)) }
				};
				colIndex++;

				// 용역총액 - 파란 톤 혼합 후 연한 버전
				dataRow.getCell(colIndex).numFmt = '#,##0';
				dataRow.getCell(colIndex).fill = {
					type: 'pattern',
					pattern: 'solid',
					fgColor: { argb: this.lightenColor(this.blendWithBlue(baseColor)) }
				};
				colIndex++;

				if (this.showUserCountColumn) {
					dataRow.getCell(colIndex).numFmt = '#,##0'; // 등록인원
					dataRow.getCell(colIndex).fill = {
						type: 'pattern',
						pattern: 'solid',
						fgColor: { argb: this.lightenColor(color) }
					};
					colIndex++;
				}
				if (this.showRevenueColumn) {
					dataRow.getCell(colIndex).numFmt = '#,##0'; // 매출금
					dataRow.getCell(colIndex).fill = {
						type: 'pattern',
						pattern: 'solid',
						fgColor: { argb: this.lightenColor(color) }
					};
					colIndex++;
				}
			});
		});
	}

	/**
	 * 총계 행 추가
	 */
	addTotalRow(worksheet, periods, periodTotals, totalCols) {
		// 총계 행 데이터 생성
		const row = ['총계', '']; // 순번, 설계사

		// 연락처 (선택적)
		if (this.showPhoneColumn) {
			row.push('');
		}

		// 설계사별 총액 계산
		let grandTotalAmount = 0;
		let grandCommissionAmount = 0;
		let grandServiceAmount = 0;

		periods.forEach(period => {
			const periodTotal = periodTotals[period] || { totalAmount: 0, commissionAmount: 0, serviceAmount: 0 };
			grandTotalAmount += periodTotal.totalAmount || 0;
			grandCommissionAmount += periodTotal.commissionAmount || 0;
			grandServiceAmount += periodTotal.serviceAmount || 0;
		});

		// 설계사별 총액 추가
		row.push(grandTotalAmount);
		row.push(grandCommissionAmount);
		row.push(grandServiceAmount);

		periods.forEach(period => {
			const periodTotal = periodTotals[period] || { totalAmount: 0, commissionAmount: 0, serviceAmount: 0, totalRevenue: 0 };
			row.push(periodTotal.totalAmount);
			row.push(periodTotal.commissionAmount);
			row.push(periodTotal.serviceAmount);
			if (this.showUserCountColumn) {
				row.push(periodTotal.totalUsers || 0);
			}
			if (this.showRevenueColumn) {
				row.push(periodTotal.totalRevenue);
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

		// 설계사별 총액 배경색 적용
		const totalSummaryCol = fixedCols + 1;
		
		const totalCell = totalRow.getCell(totalSummaryCol);
		totalCell.numFmt = '#,##0';
		totalCell.fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: 'FFC5E0B4' } // 초록
		};

		const commissionCell = totalRow.getCell(totalSummaryCol + 1);
		commissionCell.numFmt = '#,##0';
		commissionCell.fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: 'FFFFE699' } // 노랑
		};

		const serviceCell = totalRow.getCell(totalSummaryCol + 2);
		serviceCell.numFmt = '#,##0';
		serviceCell.fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: 'FFB4C7E7' } // 파랑
		};

		// 기간별 데이터 셀에 배경색 및 숫자 포맷 적용
		let colIndex = totalSummaryCol + 3;
		periods.forEach((period, periodIndex) => {
			const baseColor = this.monthColors[periodIndex % this.monthColors.length];

			// 전체총액 - 기본 색상의 연한 버전
			const periodTotalCell = totalRow.getCell(colIndex);
			periodTotalCell.numFmt = '#,##0';
			periodTotalCell.fill = {
				type: 'pattern',
				pattern: 'solid',
				fgColor: { argb: this.lightenColor(baseColor) }
			};
			colIndex++;

			// 설계총액 - 노란 톤 혼합 후 연한 버전
			const periodCommissionCell = totalRow.getCell(colIndex);
			periodCommissionCell.numFmt = '#,##0';
			periodCommissionCell.fill = {
				type: 'pattern',
				pattern: 'solid',
				fgColor: { argb: this.lightenColor(this.blendWithYellow(baseColor)) }
			};
			colIndex++;

			// 용역총액 - 파란 톤 혼합 후 연한 버전
			const periodServiceCell = totalRow.getCell(colIndex);
			periodServiceCell.numFmt = '#,##0';
			periodServiceCell.fill = {
				type: 'pattern',
				pattern: 'solid',
				fgColor: { argb: this.lightenColor(this.blendWithBlue(baseColor)) }
			};
			colIndex++;

			// 등록인원
			if (this.showUserCountColumn) {
				const userCell = totalRow.getCell(colIndex);
				userCell.numFmt = '#,##0';
				userCell.fill = {
					type: 'pattern',
					pattern: 'solid',
					fgColor: { argb: lightColor }
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
					fgColor: { argb: lightColor }
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
	 * ARGB 색상을 밝게 만드는 헬퍼 함수
	 * @param {string} argb ARGB 형식 색상 (예: 'FFB4C7E7')
	 * @returns {string} 밝게 만든 ARGB 색상
	 */
	lightenColor(argb) {
		// ARGB에서 RGB 추출
		const alpha = argb.substring(0, 2);
		const r = parseInt(argb.substring(2, 4), 16);
		const g = parseInt(argb.substring(4, 6), 16);
		const b = parseInt(argb.substring(6, 8), 16);

		// 각 채널을 밝게 (255에 가깝게)
		const lighten = (val) => Math.min(255, val + Math.floor((255 - val) * 0.6));

		const newR = lighten(r).toString(16).padStart(2, '0');
		const newG = lighten(g).toString(16).padStart(2, '0');
		const newB = lighten(b).toString(16).padStart(2, '0');

		return `${alpha}${newR}${newG}${newB}`;
	}

	/**
	 * ARGB 색상에 노란 톤 혼합
	 * @param {string} argb ARGB 형식 색상
	 * @returns {string} 노란 톤이 혼합된 ARGB 색상
	 */
	blendWithYellow(argb) {
		const alpha = argb.substring(0, 2);
		const r = parseInt(argb.substring(2, 4), 16);
		const g = parseInt(argb.substring(4, 6), 16);
		const b = parseInt(argb.substring(6, 8), 16);

		// 노란색(255, 255, 0)과 20% 혼합
		const blend = (val, target) => Math.floor(val * 0.8 + target * 0.2);

		const newR = Math.min(255, blend(r, 255)).toString(16).padStart(2, '0');
		const newG = Math.min(255, blend(g, 255)).toString(16).padStart(2, '0');
		const newB = Math.min(255, blend(b, 0)).toString(16).padStart(2, '0');

		return `${alpha}${newR}${newG}${newB}`;
	}

	/**
	 * ARGB 색상에 파란 톤 혼합
	 * @param {string} argb ARGB 형식 색상
	 * @returns {string} 파란 톤이 혼합된 ARGB 색상
	 */
	blendWithBlue(argb) {
		const alpha = argb.substring(0, 2);
		const r = parseInt(argb.substring(2, 4), 16);
		const g = parseInt(argb.substring(4, 6), 16);
		const b = parseInt(argb.substring(6, 8), 16);

		// 파란색(0, 100, 255)과 20% 혼합
		const blend = (val, target) => Math.floor(val * 0.8 + target * 0.2);

		const newR = Math.min(255, blend(r, 0)).toString(16).padStart(2, '0');
		const newG = Math.min(255, blend(g, 100)).toString(16).padStart(2, '0');
		const newB = Math.min(255, blend(b, 255)).toString(16).padStart(2, '0');

		return `${alpha}${newR}${newG}${newB}`;
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
