// scripts/seed-allowances.js
// node scripts/seed-allowances.js --loginId=admin --months=3 --wipe --amount=1000000 --cycle=30 --grade-change
import 'dotenv/config.js';
import { db } from '../src/lib/server/db.js';
import { User } from '../src/lib/server/models/User.js';
import { Allowance } from '../src/lib/server/models/Allowance.js';

const args = Object.fromEntries(
	process.argv.slice(2).map((a) => {
		const [k, v] = a.replace(/^--/, '').split('=');
		return [k, v === undefined ? true : v];
	})
);

// ---------- helpers ----------
const startOfDay = (d) => {
	const x = new Date(d);
	x.setHours(0, 0, 0, 0);
	return x;
};
const addDays = (d, n) => {
	const x = new Date(d);
	x.setDate(x.getDate() + n);
	return x;
};
const addMonths = (d, n) => {
	const x = new Date(d);
	x.setMonth(x.getMonth() + n);
	return x;
};
const yyyymm = (d) => {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	return `${y}-${m}`;
};
const fmt = (n) =>
	new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(Number(n || 0));

// ---------- parse options ----------
const now = new Date();
const today = startOfDay(now);

let from, toIncl;
if (args.from && args.to) {
	from = startOfDay(new Date(args.from));
	toIncl = startOfDay(new Date(args.to));
} else {
	const months = Math.max(1, Math.min(24, Number(args.months ?? 3)));
	toIncl = today;
	from = startOfDay(addMonths(today, -months));
}
const amount = Number(args.amount ?? 1_000_000);
const cycleTotal = Math.max(1, Math.min(9999, Number(args.cycle ?? 30)));
const wipe = !!args.wipe;
const all = !!args.all;
const dry = !!args.dry;
const withGradeChange = !!args['grade-change'];
const loginId = args.loginId;

// ---------- main ----------
(async () => {
	await db();

	let users = [];
	if (all) {
		users = await User.find({}, { _id: 1, loginId: 1, name: 1, grade: 1 }).lean();
	} else if (loginId) {
		const u = await User.findOne({ loginId }, { _id: 1, loginId: 1, name: 1, grade: 1 }).lean();
		if (!u) {
			console.error(`[ERR] loginId="${loginId}" 사용자를 찾을 수 없습니다.`);
			process.exit(1);
		}
		users = [u];
	} else {
		// 아무 옵션도 없으면 가장 먼저 만든 사용자 1명 대상
		const u = await User.findOne({}, { _id: 1, loginId: 1, name: 1, grade: 1 })
			.sort({ _id: 1 })
			.lean();
		if (!u) {
			console.error('[ERR] 사용자 컬렉션이 비어있습니다. 먼저 seed-users.js를 실행하세요.');
			process.exit(1);
		}
		users = [u];
	}

	console.log(
		`[INFO] 대상 사용자 수: ${users.length}, 기간: ${from.toISOString().slice(0, 10)} ~ ${toIncl
			.toISOString()
			.slice(0, 10)}`
	);
	if (dry) console.log('[DRY-RUN] 데이터는 생성/저장되지 않습니다.');

	const toExclusive = addDays(toIncl, 1);

	for (const u of users) {
		const userId = u._id;
		console.log(`\n==> ${u.loginId || u._id} (${u.name})`);

		if (wipe && !dry) {
			const del = await Allowance.deleteMany({ userId, date: { $gte: from, $lt: toExclusive } });
			console.log(` - 기존 내역 삭제: ${del.deletedCount}건`);
		}

		const docs = [];
		let receiptIndex = 0;

		// 일자별 지급(매일 1건, 주말 포함; 필요 시 랜덤/주중만 등으로 바꿔도 됨)
		for (let d = new Date(from); d <= toIncl; d = addDays(d, 1)) {
			receiptIndex += 1;
			docs.push({
				userId,
				date: startOfDay(d),
				type: 'payout',
				amount,
				currency: 'KRW',
				status: 'paid',
				receiptIndex,
				receiptTotal: cycleTotal,
				method: 'transfer',
				batchId: `SEED-${yyyymm(d)}`,
				statementMonth: yyyymm(d),
				note: '테스트 지급(시드)',
				tags: ['seed', 'payout'],
				createdBy: null,
				updatedBy: null
			});

			// 회차가 cycleTotal을 넘으면 새 사이클
			if (receiptIndex >= cycleTotal) receiptIndex = 0;
		}

		// 월초 등급변경 이벤트(선택)
		if (withGradeChange) {
			// from~to 범위 내의 모든 "1일"
			const firsts = [];
			const f0 = new Date(from.getFullYear(), from.getMonth(), 1);
			for (let d = new Date(f0); d <= toIncl; d = addMonths(d, 1)) {
				firsts.push(startOfDay(d));
			}
			for (const d of firsts) {
				docs.push({
					userId,
					date: d,
					type: 'grade_change',
					amount: null,
					currency: 'KRW',
					status: 'paid',
					gradeBefore: 'F1',
					gradeAfter: 'F2',
					method: null,
					batchId: `SEED-GRADE-${yyyymm(d)}`,
					statementMonth: yyyymm(d),
					note: '등급 상향(F1→F2) - 시드',
					tags: ['seed', 'grade'],
					createdBy: null,
					updatedBy: null
				});
			}
		}

		if (dry) {
			const payoutCount = docs.filter((x) => x.type === 'payout').length;
			const totalAmount = docs
				.filter(
					(x) =>
						x.type === 'payout' ||
						x.type === 'adjustment' ||
						x.type === 'carryover' ||
						x.type === 'reversal'
				)
				.reduce((s, x) => s + Number(x.amount || 0), 0);

			console.log(
				` - 생성 예정: ${docs.length}건 (지급 ${payoutCount}건, 합계 ₩${fmt(totalAmount)})`
			);
			continue;
		}

		if (docs.length > 0) {
			const inserted = await Allowance.insertMany(docs, { ordered: false });
			const payoutCount = inserted.filter((x) => x.type === 'payout').length;
			const totalAmount = inserted
				.filter(
					(x) =>
						x.type === 'payout' ||
						x.type === 'adjustment' ||
						x.type === 'carryover' ||
						x.type === 'reversal'
				)
				.reduce((s, x) => s + Number(x.amount || 0), 0);
			console.log(
				` - 생성: ${inserted.length}건 (지급 ${payoutCount}건, 합계 ₩${fmt(totalAmount)})`
			);
		} else {
			console.log(' - 생성할 항목이 없습니다.');
		}
	}

	process.exit(0);
})().catch((e) => {
	console.error(e);
	process.exit(1);
});
