// mongosh/mongo 에서 실행되는 공통 스크립트
// 외부 --eval 로 주입되는 전역 변수 사용:
//   DB_NAME, ADMIN_LOGIN_ID, ADMIN_NAME, ADMIN_HASH, ROLE, FORCE
(function () {
	function bool(v, dflt) {
		if (typeof v === 'boolean') return v;
		if (typeof v === 'string') return v.toLowerCase() === 'true';
		return dflt;
	}

	var dbName = typeof DB_NAME !== 'undefined' && DB_NAME ? DB_NAME : 'nanumpay';
	var loginId = typeof ADMIN_LOGIN_ID !== 'undefined' ? ADMIN_LOGIN_ID : 'admin';
	var name = typeof ADMIN_NAME !== 'undefined' ? ADMIN_NAME : '관리자';
	var hash = typeof ADMIN_HASH !== 'undefined' ? ADMIN_HASH : ''; // bcrypt 해시
	var role = typeof ROLE !== 'undefined' ? ROLE : 'admin';
	var force = bool(typeof FORCE !== 'undefined' ? FORCE : false, false);

	var dbx = db.getSiblingDB(dbName);

	// JSON 로더 (현재 작업 디렉토리 기준)
	function readJson(file) {
		try {
			return JSON.parse(cat(file));
		} catch (e) {
			print('[init] WARN cannot read ' + file + ': ' + e);
			return null;
		}
	}

	var userSchema = typeof USERS_SCHEMA !== 'undefined' ? USERS_SCHEMA : null;
	var userIndexes = typeof USERS_INDEXES !== 'undefined' ? USERS_INDEXES : [];

	// 컬렉션 생성/수정 (validator)
	var colNames = dbx.getCollectionNames();
	if (userSchema) {
		if (colNames.indexOf('users') >= 0) {
			dbx.runCommand({ collMod: 'users', validator: userSchema, validationLevel: 'moderate' });
			print('[init] collMod users (validator updated)');
		} else {
			dbx.createCollection('users', { validator: userSchema, validationLevel: 'moderate' });
			print('[init] createCollection users (with validator)');
		}
	} else if (colNames.indexOf('users') < 0) {
		dbx.createCollection('users');
		print('[init] createCollection users (no validator)');
	}

	// 인덱스
	if (userIndexes && userIndexes.length) {
		userIndexes.forEach(function (ix) {
			dbx.getCollection('users').createIndex(ix.keys || {}, ix.options || {});
		});
		print('[init] users indexes ensured: ' + userIndexes.length);
	}

	// 관리자
	if (!hash) {
		print('[init] SKIP admin creation: ADMIN_HASH is empty (provide via wrapper)');
		return;
	}
	var col = dbx.getCollection('users');
	var exists = col.findOne({ loginId: loginId });
	if (!exists) {
		col.insertOne({
			name: name,
			loginId: loginId,
			passwordHash: hash,
			role: role,
			createdAt: new Date()
		});
		print('[init] created admin "' + loginId + '"');
	} else if (force) {
		col.updateOne(
			{ loginId: loginId },
			{ $set: { name: name, role: role, passwordHash: hash, updatedAt: new Date() } }
		);
		print('[init] updated admin "' + loginId + '"');
	} else {
		print('[init] admin "' + loginId + '" exists (use FORCE=true to reset)');
	}
})();
