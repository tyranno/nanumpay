import { json } from '@sveltejs/kit';
import { connectDB } from '$lib/server/db.js';
import WeeklyPayment from '$lib/server/models/WeeklyPayment.js';
import User from '$lib/server/models/User.js';

export async function GET({ url }) {
	try {
		await connectDB();

		const year = parseInt(url.searchParams.get('year')) || new Date().getFullYear();
		const month = parseInt(url.searchParams.get('month'));
		const week = parseInt(url.searchParams.get('week'));
		const startWeek = parseInt(url.searchParams.get('startWeek')) || 1;
		const weekCount = parseInt(url.searchParams.get('count')) || 10;

		// 날짜 범위 파라미터 추가
		const startYear = parseInt(url.searchParams.get('startYear'));
		const startMonth = parseInt(url.searchParams.get('startMonth'));
		const endYear = parseInt(url.searchParams.get('endYear'));
		const endMonth = parseInt(url.searchParams.get('endMonth'));

		// 페이지네이션 파라미터
		const page = parseInt(url.searchParams.get('page')) || 1;
		const limit = parseInt(url.searchParams.get('limit')) || 20;
		const search = url.searchParams.get('search') || '';

		const weeks = [];

		// 단일 주차 조회
		if (month && week) {

			// 모든 사용자 정보 가져오기 (검색 조건 포함)
			const userQuery = search ? {
				$or: [
					{ name: { $regex: search, $options: 'i' } },
					{ bank: { $regex: search, $options: 'i' } }
				]
			} : {};

			// 전체 사용자 수 계산 (페이지네이션을 위해)
			const totalUsers = await User.countDocuments(userQuery);
			const totalPages = Math.ceil(totalUsers / limit);
			const skip = (page - 1) * limit;

			// 페이지에 해당하는 사용자만 가져오기
			const users = await User.find(userQuery)
				.skip(skip)
				.limit(limit)
				.lean();

			const userIds = users.map(u => u._id);
			const userMap = new Map(users.map(u => [u._id.toString(), u]));

			// 해당 사용자들의 지급 데이터 가져오기
			const payments = await WeeklyPayment.find({
				year: year,
				month: month,
				week: week,
				userId: { $in: userIds }
			});

			const paymentMap = new Map(payments.map(p => [p.userId.toString(), p]));

			// 사용자별로 데이터 정리
			const userPayments = users.map(user => {
				const payment = paymentMap.get(user._id.toString());
				return {
					userId: user._id,
					userName: user.name || 'Unknown',
					bank: user.bank || '',
					accountNumber: user.accountNumber || '',
					grade: user.grade || 'F1',
					actualAmount: payment?.totalAmount || 0,
					taxAmount: payment?.taxAmount || 0,
					netAmount: payment?.netAmount || 0,
					installments: payment?.installments || []
				};
			});

			return json({
				success: true,
				data: {
					week: `${year}년 ${month}월 ${week}주차`,
					year: year,
					monthNumber: month,
					weekNumber: week,
					payments: userPayments,
					totalAmount: userPayments.reduce((sum, p) => sum + p.actualAmount, 0),
					totalTax: userPayments.reduce((sum, p) => sum + p.taxAmount, 0),
					totalNet: userPayments.reduce((sum, p) => sum + p.netAmount, 0),
					pagination: {
						currentPage: page,
						totalPages,
						totalItems: totalUsers,
						itemsPerPage: limit
					}
				}
			});
		}

		// 날짜 범위 조회 (startYear/startMonth가 있는 경우)
		if (startYear && startMonth && endYear && endMonth) {
			const weeks = [];
			// 먼저 모든 사용자를 페이지네이션으로 가져오기
			const userQuery = search ? {
				$or: [
					{ name: { $regex: search, $options: 'i' } },
					{ bank: { $regex: search, $options: 'i' } }
				]
			} : {};

			const totalUsers = await User.countDocuments(userQuery);
			const totalPages = Math.ceil(totalUsers / limit);
			const skip = (page - 1) * limit;

			// 페이지에 해당하는 사용자만 가져오기
			const users = await User.find(userQuery)
				.skip(skip)
				.limit(limit)
				.lean();

			const userIds = users.map(u => u._id);
			const userMap = new Map(users.map(u => [u._id.toString(), u]));

			// 날짜 범위의 월별로 데이터 수집
			let currentYear = startYear;
			let currentMonth = startMonth;

			while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) {
				// 각 월의 4주 데이터
				for (let weekNum = 1; weekNum <= 4; weekNum++) {
					const payments = await WeeklyPayment.find({
						year: currentYear,
						month: currentMonth,
						week: weekNum,
						userId: { $in: userIds }
					});

					const paymentMap = new Map(payments.map(p => [p.userId.toString(), p]));

					// 사용자별로 데이터 정리
					const userPayments = users.map(user => {
						const payment = paymentMap.get(user._id.toString());
						return {
							userId: user._id,
							userName: user.name || 'Unknown',
							bank: user.bank || '',
							accountNumber: user.accountNumber || '',
							grade: user.grade || 'F1',
							actualAmount: payment?.totalAmount || 0,
							taxAmount: payment?.taxAmount || 0,
							netAmount: payment?.netAmount || 0,
							installments: payment?.installments || []
						};
					});

					weeks.push({
						week: `${currentYear}년 ${currentMonth}월 ${weekNum}주차`,
						year: currentYear,
						monthNumber: currentMonth,
						weekNumber: weekNum,
						payments: userPayments,
						totalAmount: userPayments.reduce((sum, p) => sum + p.actualAmount, 0),
						totalTax: userPayments.reduce((sum, p) => sum + p.taxAmount, 0),
						totalNet: userPayments.reduce((sum, p) => sum + p.netAmount, 0)
					});
				}

				// 다음 월로 이동
				currentMonth++;
				if (currentMonth > 12) {
					currentMonth = 1;
					currentYear++;
				}
			}

			// 날짜 범위 조회 응답
			return json({
				success: true,
				data: {
					weeks,
					pagination: {
						currentPage: page,
						totalPages,
						totalItems: totalUsers,
						itemsPerPage: limit
					}
				}
			});
		}

		// 여러 주차 조회 (기존 로직 - startWeek 기반)
		// 먼저 모든 사용자를 페이지네이션으로 가져오기
		const userQuery = search ? {
			$or: [
				{ name: { $regex: search, $options: 'i' } },
				{ bank: { $regex: search, $options: 'i' } }
			]
		} : {};

		const totalUsers = await User.countDocuments(userQuery);
		const totalPages = Math.ceil(totalUsers / limit);
		const skip = (page - 1) * limit;

		// 페이지에 해당하는 사용자만 가져오기
		const users = await User.find(userQuery)
			.skip(skip)
			.limit(limit)
			.lean();

		const userIds = users.map(u => u._id);
		const userMap = new Map(users.map(u => [u._id.toString(), u]));

		// 각 주차별로 데이터 수집
		for (let i = 0; i < weekCount; i++) {
			const currentWeek = startWeek + i;
			const calcWeek = ((currentWeek - 1) % 4) + 1; // 1-4 주차
			const monthOffset = Math.floor((currentWeek - 1) / 4);
			const calcMonth = ((monthOffset) % 12) + 1;
			const yearOffset = Math.floor(monthOffset / 12);
			const targetYear = year + yearOffset;

			// 해당 사용자들의 지급 데이터만 가져오기
			const payments = await WeeklyPayment.find({
				year: targetYear,
				month: calcMonth,
				week: calcWeek,
				userId: { $in: userIds }
			});

			const paymentMap = new Map(payments.map(p => [p.userId.toString(), p]));

			// 사용자별로 데이터 정리 (페이지에 있는 사용자 기준)
			const userPayments = users.map(user => {
				const payment = paymentMap.get(user._id.toString());
				return {
					userId: user._id,
					userName: user.name || 'Unknown',
					bank: user.bank || '',
					accountNumber: user.accountNumber || '',
					grade: user.grade || 'F1',
					actualAmount: payment?.totalAmount || 0,
					taxAmount: payment?.taxAmount || 0,
					netAmount: payment?.netAmount || 0,
					installments: payment?.installments || []
				};
			});

			weeks.push({
				week: `${targetYear}년 ${calcMonth}월 ${calcWeek}주차`,
				year: targetYear,
				monthNumber: calcMonth,
				weekNumber: calcWeek,
				payments: userPayments,
				totalAmount: userPayments.reduce((sum, p) => sum + p.actualAmount, 0),
				totalTax: userPayments.reduce((sum, p) => sum + p.taxAmount, 0),
				totalNet: userPayments.reduce((sum, p) => sum + p.netAmount, 0)
			});
		}

		// 여러 주차 조회 시에도 페이지네이션 정보 포함
		return json({
			success: true,
			data: {
				weeks,
				pagination: {
					currentPage: page,
					totalPages,
					totalItems: totalUsers,
					itemsPerPage: limit
				}
			}
		});
	} catch (error) {
		console.error('Weekly payment API error:', error);
		return json({
			success: false,
			error: error.message
		}, { status: 500 });
	}
}