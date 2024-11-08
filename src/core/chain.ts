import qs from "qs";
import { type Cache, MemoryCache } from "./cache";
import SparkMd5 from "spark-md5";

export class RequestChainResponse<T = any>
  implements Promise<RequestChain.Response<T>>
{
  private config: RequestChain.Config;
  private readonly promise: Promise<RequestChain.Response<T>>;

  private readonly abortController: AbortController;
  private intercept_request: Array<
    (config: RequestChain.Config) => Promise<void> | void
  > = [];
  private intercept_response: Array<
    (response: RequestChain.Response<T>) => Promise<void> | void
  > = [];
  private skipGlobalInterceptFlag: boolean = false;
  private options: RequestChain.Options & { memory: Cache };

  constructor(
    config: RequestChain.Config,
    options: RequestChain.Options & { memory: Cache }
  ) {
    this.config = config;
    this.options = options;
    const request = options.request;
    this.abortController = new AbortController();
    this.promise = new Promise<any>((resolve, reject) => {
      setTimeout(async () => {
        try {
          for (const handle of this.intercept_request) {
            await handle(this.config);
          }

          let handleResponse: (
            response: RequestChain.Response,
            error?: Error
          ) => any;

          if (options.interceptor && !this.skipGlobalInterceptFlag) {
            handleResponse = (await options.interceptor(
              this.config,
              this
            )) as any;
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

            const cacheData = options.memory.get(key);

            if (cacheData) {
              if (cacheData.then) {
                cacheData.then(resolve, reject);
              } else {
                resolve(cacheData);
              }
              return;
            }

            if (cache === "local" && options.local) {
              let cacheData = options.local.get(key);

              if (cacheData) {
                let result = cacheData;

                if (typeof cacheData.then === "function") {
                  result = await cacheData;
                }

                for (const handle of this.intercept_response) {
                  await handle(result);
                }

                if (handleResponse && !this.skipGlobalInterceptFlag) {
                  const response = await handleResponse(result);
                  if (response) {
                    resolve(response);
                    return;
                  }
                }

                resolve(result);

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

              if (!cache) {
                setTimeout(() => {
                  options.memory.delete(key);
                }, 0);
              }

              if (cache === "local" && options.local) {
                options.local.set(
                  key,
                  {
                    ...response,
                    request: undefined,
                    Socket: undefined,
                  },
                  expires
                );
              }

              for (const handle of this.intercept_response) {
                await handle(response);
              }

              if (handleResponse && !this.skipGlobalInterceptFlag) {
                const result = await handleResponse(response);
                if (result) {
                  return result;
                }
              }

              return response;
            } catch (error) {
              options.memory.delete(key);

              if (this.abortController.signal.aborted) {
                error.message =
                  this.abortController.signal.reason || "canceled";
                return Promise.reject(error);
              }

              if (this.config.replay && this.config.replay > 0) {
                this.config.replay--;
                return createRequest();
              }

              if (handleResponse && !this.skipGlobalInterceptFlag) {
                const result = await handleResponse(error.response, error);
                if (result) {
                  if (cache === "local" && options.local) {
                    options.local.set(
                      key,
                      {
                        ...error.response,
                        request: undefined,
                        Socket: undefined,
                      },
                      expires
                    );
                  }
                  return result;
                }
              }

              return Promise.reject(error);
            }
          };

          const promise = createRequest();

          if (mergeSame || cache) {
            options.memory.set(key, promise, expires);
          }

          promise.then(resolve, reject);
        } catch (error) {
          reject(error);
        }
      }, 0);
    });
  }

  then<TResult1 = RequestChain.Response<T>, TResult2 = never>(
    onfulfilled?: (
      value: RequestChain.Response<T>
    ) => TResult1 | PromiseLike<TResult1>,
    onrejected?: (reason: any) => TResult2 | PromiseLike<TResult2>
  ): Promise<TResult1 | TResult2> {
    return this.promise.then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: (reason: any) => TResult | PromiseLike<TResult>
  ): Promise<RequestChain.Response<T> | TResult> {
    return this.promise.catch(onrejected);
  }

  finally(onfinally?: () => void): Promise<RequestChain.Response<T>> {
    return this.promise.finally(onfinally);
  }

  /**
   * 重建当前请求
   * @param config
   * @returns
   */
  public rebuild(config?: RequestChain.Config) {
    return new RequestChainResponse(
      {
        ...this.config,
        ...config,
        headers: {
          ...this.config.headers,
          ...config.headers,
        },
      },
      this.options
    );
  }

  public skipGlobalIntercept() {
    this.skipGlobalInterceptFlag = true;
    return this;
  }

  public handleRequest(fn: (config: RequestChain.Config) => void) {
    this.intercept_request.push(fn);
    return this;
  }

  public handleResponse(fn: (response: RequestChain.Response<T>) => void) {
    this.intercept_response.push(fn);
    return this;
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

  public abort(reason?: any) {
    if (this.abortController) {
      this.abortController.abort(reason);
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

  getData(): Promise<T> {
    return this.promise.then((item) => item.data);
  }
}

class RequestChain {
  private readonly config: RequestChain.BaseConfig;
  private readonly interceptor?: RequestChain.InterceptorFn;
  private readonly local?: Cache;
  private readonly memoryCache;
  private _request: RequestChain.RequestFn;

  constructor(options: RequestChain.Options, config: RequestChain.BaseConfig) {
    this.config = config;
    this.local = options.local;
    this.interceptor = options.interceptor;
    this.memoryCache = new MemoryCache();
    this._request = options.request;
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
    if (!this.local) {
      return null;
    }
    return this.local.get(key);
  }

  public setLocalCache(key: string, data: any, expires?: number) {
    if (!this.local) {
      return this;
    }
    this.local.set(key, data, expires);
    return this;
  }

  public deleteLocalCache(key: string) {
    if (!this.local) {
      return this;
    }
    this.local.delete(key);
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
    return new RequestChainResponse<T>(
      {
        timeout: 10000,
        ...this.config,
        ...config,
        headers: {
          ...this.config?.headers,
          ...config.headers,
        },
      },
      {
        local: this.local,
        memory: this.memoryCache,
        interceptor: this.interceptor,
        request: this._request,
      }
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
    config: Config & {
      signal: AbortController["signal"];
    },
    chain: RequestChainResponse
  ) => Promise<Response<any>>;

  export interface BaseConfig {
    baseUrl?: string;
    headers?: Headers;
    mergeSame?: boolean;
    replay?: number;
    alert?: boolean;
    timeout?: number; // 毫秒
  }

  export interface Options {
    request: RequestFn;
    local?: Cache;
    interceptor?: RequestChain.InterceptorFn;
  }

  export interface Headers {
    Authorization?: string;
    "User-Agent"?: string;
    Referer?: string;
    "Content-Type"?:
      | "application/x-www-form-urlencoded"
      | "multipart/form-data"
      | "application/json"
      | "";
    "Content-Length"?: string;
    [x: string]: any;
  }

  export interface Config {
    params?: Record<string, string | number> | Array<string | number>;
    data?: any;
    method: "GET" | "POST" | "PUT" | "DELETE" | "HEAD";
    url: string;
    cache?: "memory" | "local";
    expires?: number;
    baseUrl?: string;
    headers?: Headers;
    mergeSame?: boolean;
    replay?: number;
    alert?: boolean;
    timeout?: number; // 毫秒
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

  export interface Response<T = any> {
    data: T;
    status: number;
    statusText: string;
    headers: {
      "content-encoding"?: string;
      "content-type"?: string;
      "content-range"?: string;
      date?: string;
      connection?: string;
      "content-disposition"?: string;
      "content-length"?: string;
      etag?: string;
      [x: string]: any;
    };
  }

  export type InterceptorFn = (
    config: RequestChain.Config,
    chain: RequestChainResponse
  ) =>
    | void
    | Promise<void>
    | ((
        response: Response,
        error?: Error
      ) => void | Response | Promise<Response | void>)
    | Promise<
        (
          response: Response,
          error?: Error
        ) => void | Response | Promise<Response | void>
      >;
}

export default RequestChain;
