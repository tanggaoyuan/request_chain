"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryCache = exports.Cache = void 0;
class Cache {
    constructor() {
        try {
            const cache = this.read();
            Object.keys(cache).forEach((key) => {
                const value = cache[key];
                if (!value) {
                    return;
                }
                if (typeof value.expires === 'number' &&
                    value.expires < Date.now()) {
                    cache[key] = undefined;
                }
            });
            this.stote = cache !== null && cache !== void 0 ? cache : {};
            this.write(this.stote);
        }
        catch (error) {
            this.stote = {};
        }
    }
    get(key) {
        const value = this.stote[key];
        if (!value) {
            return null;
        }
        if (typeof value.expires === 'number' && value.expires < Date.now()) {
            this.delete(key);
            return null;
        }
        return value.data;
    }
    set(key, data, expires) {
        this.stote[key] = {
            data,
            expires: typeof expires === 'number' ? Date.now() + expires : undefined,
        };
        this.write(this.stote);
    }
    delete(key) {
        if (this.stote[key]) {
            this.stote[key] = undefined;
            this.write(this.stote);
        }
    }
}
exports.Cache = Cache;
class MemoryCache extends Cache {
    read() {
        return {};
    }
    write() {
        return true;
    }
}
exports.MemoryCache = MemoryCache;
// export class LocalCache extends Cache {
//     private readonly path: string;
//     constructor(path: string) {
//         super();
//         this.path = path;
//     }
//     public read(): Record<string, { expires?: number; data: any } | undefined> {
//         try {
//             if (isBrowser()) {
//                 return JSON.parse(
//                     window.localStorage.getItem(this.path) || '{}',
//                 );
//             } else {
//                 return JSON.parse(fs.readFileSync(this.path, 'utf-8'));
//             }
//         } catch (error) {
//             return {};
//         }
//     }
//     public write(
//         data: Record<string, { expires?: number; data: any } | undefined>,
//     ): boolean {
//         try {
//             if (isBrowser()) {
//                 window.localStorage.setItem(this.path, JSON.stringify(data));
//             } else {
//                 fs.writeFileSync(this.path, JSON.stringify(data), 'utf-8');
//             }
//             return true;
//         } catch (error) {
//             return false;
//         }
//     }
// }
// export class UniLocalCache extends Cache {
//     private readonly key: string;
//     constructor(path: string) {
//         super();
//         this.key = path;
//     }
//     public read(): Record<string, { expires?: number; data: any } | undefined> {
//         try {
//             return JSON.parse(uni.getStorageSync(this.key));
//         } catch (error) {
//             return {};
//         }
//     }
//     public write(
//         data: Record<string, { expires?: number; data: any } | undefined>,
//     ): boolean {
//         uni.setStorageSync(this.key, JSON.stringify(data));
//         return true;
//     }
// }
