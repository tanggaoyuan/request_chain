export declare abstract class Cache {
    readonly stote: Record<string, {
        expires?: number;
        data: any;
    } | undefined>;
    constructor();
    abstract read(): Record<string, {
        expires?: number;
        data: any;
    } | undefined>;
    abstract write(data: Record<string, {
        expires?: number;
        data: any;
    } | undefined>): boolean;
    get<T = any>(key: string): T;
    set(key: string, data: any, expires?: number): void;
    delete(key: string): void;
}
export declare class MemoryCache extends Cache {
    read(): Record<string, {
        expires?: number;
        data: any;
    } | undefined>;
    write(): boolean;
}
//# sourceMappingURL=cache.d.ts.map