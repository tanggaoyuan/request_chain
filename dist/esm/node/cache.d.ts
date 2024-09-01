import { Cache, MemoryCache } from "../core/cache";
export { Cache, MemoryCache };
export declare class LocalCache implements Cache {
    private readonly path;
    store: Record<string, {
        expires?: number;
        data: any;
    } | undefined>;
    constructor(path: string);
    clearExpired(): void;
    get<T = any>(key: string): T;
    set(key: string, data: any, expires?: number): void;
    delete(key: string): void;
    read(): Record<string, {
        expires?: number;
        data: any;
    } | undefined>;
    write(): boolean;
}
//# sourceMappingURL=cache.d.ts.map