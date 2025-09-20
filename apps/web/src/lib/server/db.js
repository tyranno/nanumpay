import mongoose from 'mongoose';

// Node.js 스크립트와 SvelteKit 앱 둘 다 지원
let MONGODB_URI;
if (typeof process !== 'undefined' && process.env.MONGODB_URI) {
	// Node.js 환경 (스크립트)
	MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/nanumpay';
} else {
	// SvelteKit 환경
	try {
		const env = await import('$env/static/private');
		MONGODB_URI = env.MONGODB_URI;
	} catch {
		MONGODB_URI = 'mongodb://localhost:27017/nanumpay';
	}
}

let cached = global.mongoose;

if (!cached) {
	cached = global.mongoose = { conn: null, promise: null };
}

export async function db() {
	if (cached.conn) {
		return cached.conn;
	}

	if (!cached.promise) {
		const opts = {
			bufferCommands: false,
		};

		cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
			return mongoose;
		});
	}

	try {
		cached.conn = await cached.promise;
	} catch (e) {
		cached.promise = null;
		throw e;
	}

	return cached.conn;
}

export async function connectDB() {
	const mongoUri = typeof process !== 'undefined' && process.env.MONGODB_URI
		? process.env.MONGODB_URI
		: 'mongodb://localhost:27017/nanumpay';

	if (mongoose.connection.readyState === 0) {
		await mongoose.connect(mongoUri, { bufferCommands: false });
		console.log('Connected to MongoDB');
	}
	return mongoose.connection;
}

export default mongoose;