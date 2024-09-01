import { MemoryCache, Cache } from "../core/cache";
export { MemoryCache, Cache };
export declare class LocalCache implements Cache {
    private readonly id;
    constructor(key: string);
    clearExpired(): Promise<void>;
    get(key: string): any;
    set(key: string, data: any, expires?: number): void;
    delete(key: string): void;
}
export declare class IndexDBCache implements Cache {
    private readonly key;
    store: Record<string, {
        expires?: number;
        data: any;
    }>;
    constructor(key: string);
    private openDb;
    clearExpired(): Promise<void>;
    getAll(): Promise<unknown>;
    get<T = any>(key: string): Promise<T>;
    set<T = any>(key: string, data: T, expires?: number): Promise<unknown>;
    delete(key: string): Promise<unknown>;
}
//# sourceMappingURL=cache.d.ts.map