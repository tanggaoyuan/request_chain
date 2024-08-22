var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { isBrowser } from "./util";
import fs from "fs";
export class Cache {
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
export class MemoryCache extends Cache {
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
export class LocalCache extends Cache {
    constructor(path) {
        super();
        this.path = path;
        this.init();
    }
    read() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (isBrowser()) {
                    return JSON.parse(window.localStorage.getItem(this.path) || "{}");
                }
                else {
                    return JSON.parse(fs.readFileSync(this.path, "utf-8"));
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
                if (isBrowser()) {
                    window.localStorage.setItem(this.path, JSON.stringify(data));
                }
                else {
                    fs.writeFileSync(this.path, JSON.stringify(data), "utf-8");
                }
                return true;
            }
            catch (error) {
                return false;
            }
        });
    }
}
