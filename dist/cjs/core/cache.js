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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalCache = exports.MemoryCache = exports.Cache = void 0;
const util_1 = require("./util");
const fs_1 = __importDefault(require("fs"));
class Cache {
    constructor() {
        this.store = {};
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const cache = yield this.read();
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
            }
            catch (error) {
                this.store = {};
            }
        });
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
        this.write(this.store);
    }
    delete(key) {
        if (this.store[key]) {
            this.store[key] = undefined;
            this.write(this.store);
        }
    }
}
exports.Cache = Cache;
class MemoryCache extends Cache {
    constructor() {
        super();
        this.init();
    }
    read() {
        return Promise.resolve({});
    }
    write() {
        return Promise.resolve(true);
    }
}
exports.MemoryCache = MemoryCache;
class LocalCache extends Cache {
    constructor(path) {
        super();
        this.path = path;
        this.init();
    }
    read() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if ((0, util_1.isBrowser)()) {
                    return JSON.parse(window.localStorage.getItem(this.path) || "{}");
                }
                else {
                    return JSON.parse(fs_1.default.readFileSync(this.path, "utf-8"));
                }
            }
            catch (error) {
                return {};
            }
        });
    }
    write(data) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if ((0, util_1.isBrowser)()) {
                    window.localStorage.setItem(this.path, JSON.stringify(data));
                }
                else {
                    fs_1.default.writeFileSync(this.path, JSON.stringify(data), "utf-8");
                }
                return true;
            }
            catch (error) {
                return false;
            }
        });
    }
}
exports.LocalCache = LocalCache;
