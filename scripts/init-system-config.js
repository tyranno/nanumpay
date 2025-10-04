#!/usr/bin/env node

/**
 * SystemConfig 초기화 스크립트
 * 시스템 설정을 초기화하거나 업데이트합니다
 */

import mongoose from 'mongoose';
import SystemConfig from '../apps/web/src/lib/server/models/SystemConfig.js';

const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/nanumpay';

async function initSystemConfig() {
	console.log('🔧 SystemConfig 초기화 시작...\n');

	try {
		// MongoDB 연결
		await mongoose.connect(MONGO_URL);
		console.log('✅ MongoDB 연결 성공');

		// 기존 설정 확인
		const existingConfig = await SystemConfig.findOne({ configType: 'current' });

		if (existingConfig) {
			console.log('⚠️  기존 설정이 존재합니다.');
			console.log('\n현재 설정:');
			console.log('- 등급별 비율:', JSON.stringify(existingConfig.gradeRatios, null, 2));
			console.log('- 최대 지급 횟수:', JSON.stringify(existingConfig.maxPaymentCounts, null, 2));
			console.log('- 보험 최소 금액:', JSON.stringify(existingConfig.minInsuranceAmounts, null, 2));
			console.log('- 원천징수율:', existingConfig.withholdingTaxRate);
			console.log('- 용역자당 매출:', existingConfig.revenuePerUser.toLocaleString() + '원');
			console.log('- 분할 횟수:', existingConfig.installmentCount + '회');
			console.log('\n기존 설정을 유지합니다.');
		} else {
			// 새로운 설정 생성
			const config = await SystemConfig.create({
				configType: 'current',
				gradeRatios: {
					F1: 0.24,
					F2: 0.19,
					F3: 0.14,
					F4: 0.09,
					F5: 0.05,
					F6: 0.03,
					F7: 0.02,
					F8: 0.01
				},
				maxPaymentCounts: {
					F1: 20,
					F2: 30,
					F3: 40,
					F4: 40,
					F5: 50,
					F6: 50,
					F7: 60,
					F8: 60
				},
				minInsuranceAmounts: {
					F3: 50000,
					F4: 50000,
					F5: 70000,
					F6: 70000,
					F7: 100000,
					F8: 100000
				},
				withholdingTaxRate: 0.033,
				revenuePerUser: 1000000,
				installmentCount: 10,
				updatedBy: 'system'
			});

			console.log('✅ 새로운 SystemConfig 생성 완료\n');
			console.log('생성된 설정:');
			console.log('- 등급별 비율:', JSON.stringify(config.gradeRatios, null, 2));
			console.log('- 최대 지급 횟수:', JSON.stringify(config.maxPaymentCounts, null, 2));
			console.log('- 보험 최소 금액:', JSON.stringify(config.minInsuranceAmounts, null, 2));
			console.log('- 원천징수율:', config.withholdingTaxRate);
			console.log('- 용역자당 매출:', config.revenuePerUser.toLocaleString() + '원');
			console.log('- 분할 횟수:', config.installmentCount + '회');
		}

		console.log('\n✨ SystemConfig 초기화 완료!');

	} catch (error) {
		console.error('❌ 초기화 실패:', error.message);
		process.exit(1);
	} finally {
		await mongoose.disconnect();
	}
}

// 실행
initSystemConfig();