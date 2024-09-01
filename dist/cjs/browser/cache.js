"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IndexDBCache = exports.LocalCache = exports.Cache = exports.MemoryCache = void 0;
const cache_1 = require("../core/cache");
Object.defineProperty(exports, "MemoryCache", { enumerable: true, get: function () { return cache_1.MemoryCache; } });
Object.defineProperty(exports, "Cache", { enumerable: true, get: function () { return cache_1.Cache; } });
class LocalCache {
    constructor(key) {
        this.id = key;
        this.clearExpired();
    }
    clearExpired() {
        return __awaiter(this, void 0, void 0, function* () {
            for (let i = 0; i < localStorage.length; i++) {
                try {
                    const key = localStorage.key(i);
                    if (key.startsWith(this.id)) {
                        const value = JSON.parse(localStorage.getItem(key));
                        if (typeof value.expires === "number" && value.expires < Date.now()) {
                            this.delete(key);
                        }
                    }
                }
                catch (error) {
                    //
                }
            }
        });
    }
    get(key) {
        try {
            const value = JSON.parse(localStorage.getItem(`${this.id}_${key}`));
            if (typeof value.expires === "number" && value.expires < Date.now()) {
                this.delete(key);
                return null;
            }
            return value.data;
        }
        catch (error) {
            return null;
        }
    }
    set(key, data, expires) {
        localStorage.setItem(`${this.id}_${key}`, JSON.stringify({
            data,
            expires: typeof expires === "number" ? Date.now() + expires : undefined,
        }));
    }
    delete(key) {
        localStorage.removeItem(key);
    }
}
exports.LocalCache = LocalCache;
class IndexDBCache {
    constructor(key) {
        this.openDb = (version) => {
            return new Promise((resolve, reject) => {
                const indexedDB = window.indexedDB;
                if (!indexedDB) {
                    return Promise.reject(new Error("不支持DB"));
                }
                const request = indexedDB.open("REQUEST_CHAIN", version);
                request.onsuccess = (event) => {
                    const db = event.target.result;
                    if (db.objectStoreNames.contains(this.key)) {
                        resolve(db);
                    }
                    else {
                        this.openDb(db.version + 1).then(resolve, reject);
                    }
                };
                request.onerror = function (event) {
                    reject(new Error("打开数据库失败"));
                };
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    db.createObjectStore(this.key, { keyPath: "id" });
                };
            });
        };
        this.key = key;
        this.clearExpired();
    }
    clearExpired() {
        return __awaiter(this, void 0, void 0, function* () {
            const db = yield this.openDb();
            const transaction = db.transaction([this.key], "readonly");
            const objectStore = transaction.objectStore(this.key);
            const request = objectStore.getAll();
            request.onsuccess = () => {
                request.result.forEach((item) => {
                    const { expires, id } = item;
                    if (typeof expires === "number" && expires < Date.now()) {
                        this.delete(id);
                    }
                });
            };
        });
    }
    getAll() {
        return __awaiter(this, void 0, void 0, function* () {
            const db = yield this.openDb();
            const transaction = db.transaction([this.key], "readonly");
            const objectStore = transaction.objectStore(this.key);
            const request = objectStore.getAll();
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    resolve(request.result);
                };
                request.onerror = reject;
            });
        });
    }
    get(key) {
        return __awaiter(this, void 0, void 0, function* () {
            const db = yield this.openDb();
            const transaction = db.transaction([this.key], "readonly");
            const objectStore = transaction.objectStore(this.key);
            const request = objectStore.get(key);
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const { data, expires, id } = request.result;
                    if (typeof expires === "number" && expires < Date.now()) {
                        this.delete(id);
                        resolve(null);
                    }
                    else {
                        resolve(data);
                    }
                };
                request.onerror = reject;
            });
        });
    }
    set(key, data, expires) {
        return __awaiter(this, void 0, void 0, function* () {
            const db = yield this.openDb();
            return new Promise((resolve, reject) => {
                const task = db
                    .transaction([this.key], "readwrite")
                    .objectStore(this.key)
                    .add({
                    data,
                    expires: typeof expires === "number" ? Date.now() + expires : undefined,
                    id: key,
                });
                task.onsuccess = () => resolve(true);
                task.onerror = () => reject(false);
            });
        });
    }
    delete(key) {
        return __awaiter(this, void 0, void 0, function* () {
            const db = yield this.openDb();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.key], "readwrite");
                const objectStore = transaction.objectStore(this.key);
                const task = objectStore.delete(key);
                task.onsuccess = () => resolve(true);
                task.onerror = () => reject(false);
            });
        });
    }
}
exports.IndexDBCache = IndexDBCache;
