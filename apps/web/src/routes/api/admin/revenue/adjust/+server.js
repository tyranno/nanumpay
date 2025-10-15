/**
 * POST /api/admin/revenue/adjust
 * 월별 매출 수동 조정 API (v7.1)
 */

import { json } from '@sveltejs/kit';
import { adjustRevenue } from '$lib/server/services/revenueService.js';

export async function POST({ request, locals }) {
  try {
    // 관리자 권한 확인
    if (!locals.user || !locals.user.isAdmin) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { monthKey, adjustedRevenue, reason, force } = await request.json();

    // 입력 검증
    if (!monthKey || typeof adjustedRevenue !== 'number') {
      return json({ error: 'Invalid parameters' }, { status: 400 });
    }

    if (adjustedRevenue < 0) {
      return json({ error: '매출액은 0 이상이어야 합니다' }, { status: 400 });
    }

    // monthKey 형식 검증 (YYYY-MM)
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) {
      return json({ error: 'monthKey must be in YYYY-MM format' }, { status: 400 });
    }

    console.log(`\n📝 [POST /api/admin/revenue/adjust] Request:`, {
      monthKey,
      adjustedRevenue,
      reason,
      force,
      admin: locals.user.name
    });

    // 매출 조정 실행
    const result = await adjustRevenue(
      monthKey,
      adjustedRevenue,
      locals.user,
      reason || '사유 미기재',
      force || false
    );

    if (!result.success) {
      return json({ error: result.message }, { status: 400 });
    }

    return json({
      success: true,
      message: result.message,
      details: result.details
    });
  } catch (error) {
    console.error('❌ [POST /api/admin/revenue/adjust] Error:', error);
    return json({ error: error.message }, { status: 500 });
  }
}
