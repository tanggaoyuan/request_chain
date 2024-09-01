"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalCache = exports.MemoryCache = exports.Cache = void 0;
const cache_1 = require("../core/cache");
Object.defineProperty(exports, "Cache", { enumerable: true, get: function () { return cache_1.Cache; } });
Object.defineProperty(exports, "MemoryCache", { enumerable: true, get: function () { return cache_1.MemoryCache; } });
const fs_1 = __importDefault(require("fs"));
class LocalCache {
    constructor(path) {
        this.store = {};
        this.path = path;
        this.clearExpired();
    }
    clearExpired() {
        try {
            const cache = this.read();
            Object.keys(cache).forEach((key) => {
                const value = cache[key];
                if (!value) {
                    return;
                }
                if (typeof value.expires === "number" && value.expires < Date.now()) {
                    cache[key] = undefined;
                }
            });
            this.store = cache !== null && cache !== void 0 ? cache : {};
            this.write();
        }
        catch (error) {
            this.store = {};
        }
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
        this.write();
    }
    delete(key) {
        this.store[key] = undefined;
        this.write();
    }
    read() {
        try {
            return JSON.parse(fs_1.default.readFileSync(this.path, "utf-8"));
        }
        catch (error) {
            return {};
        }
    }
    write() {
        try {
            fs_1.default.writeFileSync(this.path, JSON.stringify(this.store), "utf-8");
            return true;
        }
        catch (error) {
            return false;
        }
    }
}
exports.LocalCache = LocalCache;
