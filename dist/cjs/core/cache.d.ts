export declare abstract class Cache {
    store: Record<string, {
        expires?: number;
        data: any;
    } | undefined>;
    init(): Promise<void>;
    abstract read(): Promise<Record<string, {
        expires?: number;
        data: any;
    } | undefined>>;
    abstract write(data: Record<string, {
        expires?: number;
        data: any;
    } | undefined>): Promise<boolean>;
    get<T = any>(key: string): T;
    set(key: string, data: any, expires?: number): void;
    delete(key: string): void;
}
export declare class MemoryCache extends Cache {
    constructor();
    read(): Promise<Record<string, {
        expires?: number;
        data: any;
    } | undefined>>;
    write(): Promise<boolean>;
}
export declare class LocalCache extends Cache {
    private readonly path;
    constructor(path: string);
    read(): Promise<Record<string, {
        expires?: number;
        data: any;
    } | undefined>>;
    write(data: Record<string, {
        expires?: number;
        data: any;
    } | undefined>): Promise<boolean>;
}
