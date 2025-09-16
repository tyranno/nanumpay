// 간단한 메모리 캐시 구현
class SimpleCache {
	constructor(ttl = 60000) { // 기본 TTL 60초
		this.cache = new Map();
		this.timers = new Map();
		this.ttl = ttl;
	}

	get(key) {
		const item = this.cache.get(key);
		if (item) {
			return item.value;
		}
		return undefined;
	}

	set(key, value, customTTL) {
		// 기존 타이머가 있다면 제거
		if (this.timers.has(key)) {
			clearTimeout(this.timers.get(key));
		}

		// 캐시에 저장
		this.cache.set(key, { value, timestamp: Date.now() });

		// TTL 설정
		const ttl = customTTL || this.ttl;
		const timer = setTimeout(() => {
			this.cache.delete(key);
			this.timers.delete(key);
		}, ttl);

		this.timers.set(key, timer);
	}

	del(key) {
		if (this.timers.has(key)) {
			clearTimeout(this.timers.get(key));
			this.timers.delete(key);
		}
		return this.cache.delete(key);
	}

	flush() {
		// 모든 타이머 정리
		this.timers.forEach(timer => clearTimeout(timer));
		this.timers.clear();
		this.cache.clear();
	}

	keys() {
		return Array.from(this.cache.keys());
	}

	has(key) {
		return this.cache.has(key);
	}

	size() {
		return this.cache.size;
	}
}

// 싱글톤 인스턴스
let cacheInstance = null;

export function getCache(ttl) {
	if (!cacheInstance) {
		cacheInstance = new SimpleCache(ttl);
	}
	return cacheInstance;
}

export default SimpleCache;