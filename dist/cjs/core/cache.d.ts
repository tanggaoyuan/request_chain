export declare abstract class Cache {
    abstract get(key: string): any;
    abstract set(key: string, data: any, expires?: number): any;
    abstract delete(key: string): any;
}
export declare class MemoryCache implements Cache {
    store: Record<string, {
        expires?: number;
        data: any;
    } | undefined>;
    get<T = any>(key: string): T;
    set<T = any>(key: string, data: T, expires?: number): void;
    delete(key: string): void;
}
//# sourceMappingURL=cache.d.ts.map