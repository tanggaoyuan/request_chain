"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryCache = exports.Cache = void 0;
class Cache {
}
exports.Cache = Cache;
class MemoryCache {
    constructor() {
        this.store = {};
    }
    get(key) {
        const value = this.store[key];
        if (!value) {
            return null;
        }
        if (typeof value.expires === "number" && value.expires < Date.now()) {
            this.delete(key);
            return null;
        }
        return value.data;
    }
    set(key, data, expires) {
        this.store[key] = {
            data,
            expires: typeof expires === "number" ? Date.now() + expires : undefined,
        };
    }
    delete(key) {
        if (this.store[key]) {
            this.store[key] = undefined;
        }
    }
}
exports.MemoryCache = MemoryCache;
