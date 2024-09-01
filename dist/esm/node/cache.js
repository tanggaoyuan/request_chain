import { Cache, MemoryCache } from "../core/cache";
import fs from "fs";
export { Cache, MemoryCache };
export class LocalCache {
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
            return JSON.parse(fs.readFileSync(this.path, "utf-8"));
        }
        catch (error) {
            return {};
        }
    }
    write() {
        try {
            fs.writeFileSync(this.path, JSON.stringify(this.store), "utf-8");
            return true;
        }
        catch (error) {
            return false;
        }
    }
}
