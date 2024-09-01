import { type Cache } from "./cache";
export declare class RequestChainResponse<T = any> implements Promise<RequestChain.Response<T>> {
    private config;
    private readonly promise;
    private readonly abortController;
    private chain;
    constructor(config: RequestChain.Config, chain: RequestChain);
    then<TResult1 = RequestChain.Response<T>, TResult2 = never>(onfulfilled?: (value: RequestChain.Response<T>) => TResult1 | PromiseLike<TResult1>, onrejected?: (reason: any) => TResult2 | PromiseLike<TResult2>): Promise<TResult1 | TResult2>;
    catch<TResult = never>(onrejected?: (reason: any) => TResult | PromiseLike<TResult>): Promise<RequestChain.Response<T> | TResult>;
    finally(onfinally?: () => void): Promise<RequestChain.Response<T>>;
    /**
     * 重建请求类
     */
    rebuild(config?: Partial<RequestChain.Config>, mix?: boolean): RequestChainResponse<T>;
    setConfig(config: Partial<RequestChain.Config>, mix?: boolean): this;
    setHeaders(headers: RequestChain.Headers, mix?: boolean): this;
    headerFromData(): this;
    headerJson(): this;
    headerFormUrlencoded(): this;
    /**
     * 启用接口缓存，如果存在缓存则用缓存
     */
    cache(type?: "memory" | "local", expires?: number): this;
    disableCache(): this;
    enableMergeSame(): this;
    disableMergeSame(): this;
    timeout(time: number): this;
    abort(): this;
    replay(count: number): this;
    enableAlert(): this;
    disableAlert(): this;
    private serializeParams;
    send(data: any, mix?: boolean): this;
    query(params: Record<string, any> | any[], mix?: boolean): this;
    [Symbol.toStringTag]: string;
    getData(): Promise<T>;
}
declare class RequestChain {
    private readonly config;
    private readonly interceptor?;
    private readonly localCache?;
    private readonly memoryCache;
    constructor(config: RequestChain.BaseConfig, interceptor?: RequestChain.Interceptor);
    setMemoryCache(key: string, data: any, expires?: number): this;
    getMemoryCache(key: string): any;
    deleteMemoryCache(key: string): this;
    getLocalCache(key: string): any;
    setLocalCache(key: string, data: any, expires?: number): this;
    deleteLocalCache(key: string): this;
    getMobileUserAgent(type?: "iPhone" | "Android"): "Mozilla/5.0 (Linux; U; Android 9; zh-cn; Redmi Note 8 Build/PKQ1.190616.001) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/71.0.3578.141 Mobile Safari/537.36 XiaoMi/MiuiBrowser/12.5.22" | "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.";
    getPcUserAgent(type?: "Mac" | "Windows"): "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0" | "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.2 Safari/605.1.15";
    request<T = any>(config: RequestChain.Config): RequestChainResponse<T>;
    get<T = any>(url: string, params?: Record<string, string | number>): RequestChainResponse<T>;
    post<T = any>(url: string, data?: any, params?: Record<string, string | number>): RequestChainResponse<T>;
    put<T = any>(url: string, data?: any, params?: Record<string, string | number>): RequestChainResponse<T>;
    delete<T = any>(url: string, params?: Record<string, string | number>): RequestChainResponse<T>;
}
declare namespace RequestChain {
    type RequestFn = (config: Omit<Config, "cache" | "request"> & {
        signal: AbortController["signal"];
    }, chain: RequestResponse) => Promise<Response<any>>;
    interface BaseConfig {
        baseUrl?: string;
        headers?: Headers;
        request: RequestFn;
        localCache?: Cache;
        mergeSame?: boolean;
        replay?: number;
        alert?: boolean;
        timeout?: number;
    }
    type RequestResponse = RequestChainResponse;
    interface Headers {
        Authorization?: string;
        "User-Agent"?: string;
        Referer?: string;
        "Content-Type"?: "application/x-www-form-urlencoded" | "multipart/form-data" | "application/json" | "";
        "Content-Length"?: string;
        [x: string]: any;
    }
    interface Config {
        params?: Record<string, string | number> | Array<string | number>;
        data?: any;
        method: "GET" | "POST" | "PUT" | "DELETE" | "HEAD";
        url: string;
        interceptor?: Interceptor;
        cache?: "memory" | "local";
        expires?: number;
        baseUrl?: string;
        headers?: Headers;
        mergeSame?: boolean;
        replay?: number;
        alert?: boolean;
        timeout?: number;
        responseType?: "arraybuffer" | "blob" | "text" | "stream" | "json";
        agent?: any;
        onUploadProgress?: (value: {
            progress?: number;
            loaded?: number;
            total?: number;
        }) => void;
        onDownloadProgress?: (value: {
            progress?: number;
            loaded?: number;
            total?: number;
        }) => void;
        [x: string]: any;
    }
    interface Response<T = any> {
        data: T;
        status: number;
        statusText: string;
        headers: {
            [x: string]: any;
        };
    }
    interface Interceptor<R extends RequestChain.Response = RequestChain.Response> {
        handleRequest?: (chain: RequestChainResponse<any>) => void | Promise<void>;
        handleResonse?: (response: R, config: RequestChain.Config) => Promise<R> | void;
        handleError?: (error: any, chain: RequestChainResponse<any>) => Promise<R | void> | void;
        handleAlert?: (error: any, config: RequestChain.Config) => void;
    }
}
export default RequestChain;
//# sourceMappingURL=chain.d.ts.map