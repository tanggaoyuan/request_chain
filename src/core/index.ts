import qs from "qs";
import { type Cache, MemoryCache } from "./cache";
import SparkMd5 from "spark-md5";

export class RequestChainResponse<
  T = any,
  R extends RequestChain.Response = RequestChain.Response<T>
> implements Promise<R>
{
  private config: RequestChain.Config;
  private readonly promise: Promise<R>;

  private readonly abortController: AbortController;
  private chain: RequestChain;

  constructor(config: RequestChain.Config, chain: RequestChain) {
    this.config = config;
    const request = config.request;
    this.abortController = new AbortController();
    this.chain = chain;
    this.promise = new Promise<any>((resolve, reject) => {
      setTimeout(async () => {
        try {
          const interceptor = this.config.interceptor ?? {};
          const { handleRequest, handleResonse, handleError, handleAlert } =
            interceptor;

          if (handleRequest) {
            await handleRequest(this);
          }

          let { url, baseUrl = "", mergeSame, cache, expires } = this.config;

          url = url.startsWith("http") ? url : `${baseUrl}${this.config.url}`;

          const [host, query] = url.split("?") ?? ["", ""];

          const urlParams = {
            ...qs.parse(query),
            ...this.config.params,
          };

          url = host + "?" + qs.stringify(urlParams);

          let key = "";

          if (!!cache || mergeSame) {
            key = `${this.config.method}${host}(${this.serializeParams(
              urlParams
            )})(${this.serializeParams(this.config.data)})`;
            const md5 = new SparkMd5();
            md5.append(key);
            key = md5.end();

            const cacheData = chain.getMemoryCache(key);

            // console.log("getMemoryCache", cacheData, key);

            if (cacheData) {
              if (cacheData.then) {
                cacheData.then(resolve, reject);
              } else {
                resolve(cacheData);
              }
              return;
            }

            if (cache === "local") {
              const cacheData = chain.getLocalCache(key);
              // console.log('getLocalCache', cacheData, key);
              if (cacheData) {
                resolve(cacheData);
                return;
              }
            }
          }

          const createRequest = async () => {
            try {
              const response = await request(
                {
                  signal: this.abortController.signal,
                  ...this.config,
                  url,
                  params: undefined,
                },
                this
              );

              if (handleResonse) {
                const result = await handleResonse(response, this.config);
                if (result) {
                  return result;
                }
              }

              if (!cache) {
                setTimeout(() => {
                  chain.deleteMemoryCache(key);
                }, 0);
              }

              if (cache === "local") {
                chain.setLocalCache(
                  key,
                  {
                    ...response,
                    request: undefined,
                    Socket: undefined,
                  },
                  expires
                );
              }

              return response;
            } catch (error) {
              if (this.config.replay && this.config.replay > 0) {
                this.config.replay--;
                return createRequest();
              }

              chain.deleteMemoryCache(key);

              if (handleError) {
                try {
                  const result = await handleError(error, this);
                  if (result) {
                    return result;
                  }
                } catch (error) {
                  if (config.alert) {
                    handleAlert && handleAlert(error, config);
                  }
                  reject(error);
                  return;
                }
              }

              if (config.alert) {
                handleAlert && handleAlert(error, config);
              }

              return Promise.reject(error);
            }
          };

          const promise = createRequest();

          // 执行时缓存不管成功还是失败;
          if (mergeSame || cache) {
            chain.setMemoryCache(key, promise);
          }
          promise.then(resolve, reject);
        } catch (error) {
          reject(error);
        }
      }, 0);
    });
  }

  then<TResult1 = R, TResult2 = never>(
    onfulfilled?: (value: R) => TResult1 | PromiseLike<TResult1>,
    onrejected?: (reason: any) => TResult2 | PromiseLike<TResult2>
  ): Promise<TResult1 | TResult2> {
    return this.promise.then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: (reason: any) => TResult | PromiseLike<TResult>
  ): Promise<R | TResult> {
    return this.promise.catch(onrejected);
  }

  finally(onfinally?: () => void): Promise<R> {
    return this.promise.finally(onfinally);
  }

  /**
   * 重建请求类
   */
  public rebuild(config?: Partial<RequestChain.Config>) {
    return new RequestChainResponse<T, R>(
      {
        ...this.config,
        ...config,
      },
      this.chain
    );
  }

  public setConfig(config: Partial<RequestChain.Config>, mix = true) {
    this.config = mix
      ? {
          ...this.config,
          ...config,
          headers: {
            ...this.config.headers,
            ...config.headers,
          },
          interceptor: {
            ...this.config.interceptor,
            ...config.interceptor,
          },
        }
      : (config as RequestChain.Config);
    return this;
  }

  public setHeaders(headers: RequestChain.Headers, mix = true) {
    this.config.headers = mix
      ? { ...this.config.headers, ...headers }
      : headers;
    return this;
  }

  public headerFromData() {
    return this.setHeaders({ "Content-Type": "multipart/form-data" });
  }

  public headerJson() {
    return this.setHeaders({ "Content-Type": "application/json" });
  }

  public headerFormUrlencoded() {
    return this.setHeaders({
      "Content-Type": "application/x-www-form-urlencoded",
    });
  }

  /**
   * 启用接口缓存，如果存在缓存则用缓存
   */
  public cache(type: "memory" | "local" = "memory", expires?: number) {
    this.config.expires = expires;
    this.config.cache = type;
    return this;
  }

  public disableCache() {
    this.config.expires = undefined;
    this.config.cache = undefined;
    return this;
  }

  public enableMergeSame() {
    this.config.mergeSame = true;
    return this;
  }

  public disableMergeSame() {
    this.config.mergeSame = false;
    return this;
  }

  public timeout(time: number) {
    this.config.timeout = time;
    return this;
  }

  public abort() {
    if (this.abortController) {
      this.abortController.abort();
    }
    return this;
  }

  public replay(count: number) {
    this.config.replay = count;
    return this;
  }

  public enableAlert() {
    this.config.alert = true;
    return this;
  }

  public disableAlert() {
    this.config.alert = false;
    return this;
  }

  private serializeParams(params?: any) {
    if (!params) {
      return "NONE";
    }
    if (Array.isArray(params)) {
      return JSON.stringify(params);
    }
    if (params?.constructor === Object) {
      const data: Record<string, any> = {};
      Object.keys(params)
        .sort()
        .forEach((key) => {
          data[key] = this.serializeParams(params[key]);
        });
      return JSON.stringify(data);
    }
    if (["boolean", "bigint", "number", "string"].includes(typeof params)) {
      return params;
    }
    return "NONE";
  }

  public send(data: any, mix = true) {
    if (Array.isArray(data)) {
      this.config.data =
        mix && this.config.data ? [...this.config.data, ...data] : data;
    } else if (typeof data === "object" && data) {
      this.config.data = mix
        ? {
            ...this.config.data,
            ...data,
          }
        : data;
    } else {
      this.config.data = data;
    }

    return this;
  }

  public query(params: Record<string, any> | any[], mix = true) {
    if (Array.isArray(params)) {
      this.config.params =
        mix && this.config.params
          ? [...(this.config.params as any), ...params]
          : params;
    } else if (typeof params === "object" && params) {
      this.config.params = mix
        ? {
            ...this.config.params,
            ...params,
          }
        : params;
    } else {
      this.config.params = params;
    }
    return this;
  }

  [Symbol.toStringTag] = "RequestChainResponse";

  getData() {
    return this.promise.then((item) => item.data);
  }
}

class RequestChain<
  R extends RequestChain.Response<any> = RequestChain.Response<any>
> {
  private readonly config: RequestChain.BaseConfig;
  private readonly interceptor?: RequestChain.Interceptor;
  private readonly localCache?: Cache;

  private readonly memoryCache;

  constructor(
    config: RequestChain.BaseConfig,
    interceptor?: RequestChain.Interceptor
  ) {
    this.config = {
      ...config,
      localCache: undefined,
    };
    this.localCache = config.localCache;
    this.interceptor = interceptor;
    this.memoryCache = new MemoryCache();
  }

  public setMemoryCache(key: string, data: any, expires?: number) {
    this.memoryCache.set(key, data, expires);
    return this;
  }

  public getMemoryCache(key: string) {
    return this.memoryCache.get(key);
  }

  public deleteMemoryCache(key: string) {
    this.memoryCache.delete(key);
    return this;
  }

  public getLocalCache(key: string) {
    if (!this.localCache) {
      return null;
    }
    return this.localCache.get(key);
  }

  public setLocalCache(key: string, data: any, expires?: number) {
    if (!this.localCache) {
      return this;
    }
    this.localCache.set(key, data, expires);
    return this;
  }

  public deleteLocalCache(key: string) {
    if (!this.localCache) {
      return this;
    }
    this.localCache.delete(key);
    return this;
  }

  public getMobileUserAgent(type: "iPhone" | "Android" = "Android") {
    return type === "Android"
      ? "Mozilla/5.0 (Linux; U; Android 9; zh-cn; Redmi Note 8 Build/PKQ1.190616.001) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/71.0.3578.141 Mobile Safari/537.36 XiaoMi/MiuiBrowser/12.5.22"
      : "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.";
  }

  public getPcUserAgent(type: "Mac" | "Windows" = "Windows") {
    return type === "Windows"
      ? "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0"
      : "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.2 Safari/605.1.15";
  }

  public request<T = any>(config: RequestChain.Config) {
    return new RequestChainResponse<T, Omit<R, "data"> & { data: T }>(
      {
        timeout: 2000,
        ...this.config,
        ...config,
        interceptor: {
          ...this.interceptor,
          ...config.interceptor,
        },
        request: this.config.request,
      },
      this
    );
  }

  public get<T = any>(url: string, params?: Record<string, string | number>) {
    return this.request<T>({
      method: "GET",
      params,
      url,
    });
  }

  public post<T = any>(
    url: string,
    data?: any,
    params?: Record<string, string | number>
  ) {
    return this.request<T>({
      method: "POST",
      params,
      data,
      url,
    });
  }

  public put<T = any>(
    url: string,
    data?: any,
    params?: Record<string, string | number>
  ) {
    return this.request<T>({
      method: "PUT",
      params,
      data,
      url,
    });
  }

  public delete<T = any>(
    url: string,
    params?: Record<string, string | number>
  ) {
    return this.request<T>({
      method: "DELETE",
      params,
      url,
    });
  }
}

namespace RequestChain {
  export type RequestFn = (
    config: Omit<Config, "cache" | "request"> & {
      signal: AbortController["signal"];
    },
    chain: RequestResponse
  ) => Promise<Response<any>>;

  export interface BaseConfig {
    baseUrl?: string;
    headers?: Headers;
    request: RequestFn;
    localCache?: Cache;
    mergeSame?: boolean;
    replay?: number;
    alert?: boolean;
    timeout?: number; // 毫秒
  }

  export type RequestResponse = RequestChainResponse;

  export interface Headers {
    Authorization?: string;
    "User-Agent"?: string;
    Referer?: string;
    "Content-Type"?:
      | "application/x-www-form-urlencoded"
      | "multipart/form-data"
      | "application/json"
      | "";
    "Content-Length"?: string | number;
    [x: string]: any;
  }

  export interface Config {
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
    timeout?: number; // 毫秒
    responseType?: "arraybuffer" | "blob" | "text" | "stream" | "json";
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

  export interface Response<T = any> {
    data: T;
    status: number;
    statusText: string;
    headers: {
      [x: string]: any;
    };
  }

  export interface Interceptor<
    R extends RequestChain.Response = RequestChain.Response
  > {
    handleRequest?: (
      chain: RequestChainResponse<any, R>
    ) => void | Promise<void>;
    handleResonse?: (
      response: R,
      config: RequestChain.Config
    ) => Promise<R> | void;
    handleError?: (
      error: any,
      chain: RequestChainResponse<any, R>
    ) => Promise<R | void> | void;
    handleAlert?: (error: any, config: RequestChain.Config) => void;
  }
}

export default RequestChain;
