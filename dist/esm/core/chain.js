var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var _a;
import qs from "qs";
import { MemoryCache } from "./cache";
import SparkMd5 from "spark-md5";
export class RequestChainResponse {
    constructor(config, options) {
        this.intercept_request = [];
        this.intercept_response = [];
        this.skipGlobalInterceptFlag = false;
        this[_a] = "RequestChainResponse";
        this.config = config;
        this.options = options;
        const request = options.request;
        this.abortController = new AbortController();
        this.promise = new Promise((resolve, reject) => {
            setTimeout(() => __awaiter(this, void 0, void 0, function* () {
                var _b;
                try {
                    for (const handle of this.intercept_request) {
                        yield handle(this.config);
                    }
                    let handleResponse;
                    if (options.interceptor && !this.skipGlobalInterceptFlag) {
                        handleResponse = (yield options.interceptor(this.config, this));
                    }
                    let { url, baseUrl = "", mergeSame, cache, expires } = this.config;
                    url = url.startsWith("http") ? url : `${baseUrl}${this.config.url}`;
                    const [host, query] = (_b = url.split("?")) !== null && _b !== void 0 ? _b : ["", ""];
                    const urlParams = Object.assign(Object.assign({}, qs.parse(query)), this.config.params);
                    url = host + "?" + qs.stringify(urlParams);
                    let key = "";
                    if (!!cache || mergeSame) {
                        key = `${this.config.method}${host}(${this.serializeParams(urlParams)})(${this.serializeParams(this.config.data)})`;
                        const md5 = new SparkMd5();
                        md5.append(key);
                        key = md5.end();
                        const cacheData = options.memory.get(key);
                        if (cacheData) {
                            if (cacheData.then) {
                                cacheData.then(resolve, reject);
                            }
                            else {
                                resolve(cacheData);
                            }
                            return;
                        }
                        if (cache === "local" && options.local) {
                            let cacheData = options.local.get(key);
                            if (cacheData) {
                                let result = cacheData;
                                if (typeof cacheData.then === "function") {
                                    result = yield cacheData;
                                }
                                for (const handle of this.intercept_response) {
                                    yield handle(result);
                                }
                                if (handleResponse && !this.skipGlobalInterceptFlag) {
                                    const response = yield handleResponse(result);
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
                    const createRequest = () => __awaiter(this, void 0, void 0, function* () {
                        try {
                            const response = yield request(Object.assign(Object.assign({ signal: this.abortController.signal }, this.config), { url, params: undefined }), this);
                            if (!cache) {
                                setTimeout(() => {
                                    options.memory.delete(key);
                                }, 0);
                            }
                            if (cache === "local" && options.local) {
                                options.local.set(key, Object.assign(Object.assign({}, response), { request: undefined, Socket: undefined }), expires);
                            }
                            for (const handle of this.intercept_response) {
                                yield handle(response);
                            }
                            if (handleResponse && !this.skipGlobalInterceptFlag) {
                                const result = yield handleResponse(response);
                                if (result) {
                                    return result;
                                }
                            }
                            return response;
                        }
                        catch (error) {
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
                                const result = yield handleResponse(error.response, error);
                                if (result) {
                                    if (cache === "local" && options.local) {
                                        options.local.set(key, Object.assign(Object.assign({}, error.response), { request: undefined, Socket: undefined }), expires);
                                    }
                                    return result;
                                }
                            }
                            return Promise.reject(error);
                        }
                    });
                    const promise = createRequest();
                    if (mergeSame || cache) {
                        options.memory.set(key, promise, expires);
                    }
                    promise.then(resolve, reject);
                }
                catch (error) {
                    reject(error);
                }
            }), 0);
        });
    }
    then(onfulfilled, onrejected) {
        return this.promise.then(onfulfilled, onrejected);
    }
    catch(onrejected) {
        return this.promise.catch(onrejected);
    }
    finally(onfinally) {
        return this.promise.finally(onfinally);
    }
    /**
     * 重建当前请求
     * @param config
     * @returns
     */
    rebuild(config) {
        return new RequestChainResponse(Object.assign(Object.assign(Object.assign({}, this.config), config), { headers: Object.assign(Object.assign({}, this.config.headers), config.headers) }), this.options);
    }
    skipGlobalIntercept() {
        this.skipGlobalInterceptFlag = true;
        return this;
    }
    handleRequest(fn) {
        this.intercept_request.push(fn);
        return this;
    }
    handleResponse(fn) {
        this.intercept_response.push(fn);
        return this;
    }
    setConfig(config, mix = true) {
        this.config = mix
            ? Object.assign(Object.assign(Object.assign({}, this.config), config), { headers: Object.assign(Object.assign({}, this.config.headers), config.headers), interceptor: Object.assign(Object.assign({}, this.config.interceptor), config.interceptor) }) : config;
        return this;
    }
    setHeaders(headers, mix = true) {
        this.config.headers = mix
            ? Object.assign(Object.assign({}, this.config.headers), headers) : headers;
        return this;
    }
    headerFromData() {
        return this.setHeaders({ "Content-Type": "multipart/form-data" });
    }
    headerJson() {
        return this.setHeaders({ "Content-Type": "application/json" });
    }
    headerFormUrlencoded() {
        return this.setHeaders({
            "Content-Type": "application/x-www-form-urlencoded",
        });
    }
    /**
     * 启用接口缓存，如果存在缓存则用缓存
     */
    cache(type = "memory", expires) {
        this.config.expires = expires;
        this.config.cache = type;
        return this;
    }
    disableCache() {
        this.config.expires = undefined;
        this.config.cache = undefined;
        return this;
    }
    enableMergeSame() {
        this.config.mergeSame = true;
        return this;
    }
    disableMergeSame() {
        this.config.mergeSame = false;
        return this;
    }
    timeout(time) {
        this.config.timeout = time;
        return this;
    }
    abort(reason) {
        if (this.abortController) {
            this.abortController.abort(reason);
        }
        return this;
    }
    replay(count) {
        this.config.replay = count;
        return this;
    }
    enableAlert() {
        this.config.alert = true;
        return this;
    }
    disableAlert() {
        this.config.alert = false;
        return this;
    }
    serializeParams(params) {
        if (!params) {
            return "NONE";
        }
        if (Array.isArray(params)) {
            return JSON.stringify(params);
        }
        if ((params === null || params === void 0 ? void 0 : params.constructor) === Object) {
            const data = {};
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
    send(data, mix = true) {
        if (Array.isArray(data)) {
            this.config.data =
                mix && this.config.data ? [...this.config.data, ...data] : data;
        }
        else if (typeof data === "object" && data) {
            this.config.data = mix
                ? Object.assign(Object.assign({}, this.config.data), data) : data;
        }
        else {
            this.config.data = data;
        }
        return this;
    }
    query(params, mix = true) {
        if (Array.isArray(params)) {
            this.config.params =
                mix && this.config.params
                    ? [...this.config.params, ...params]
                    : params;
        }
        else if (typeof params === "object" && params) {
            this.config.params = mix
                ? Object.assign(Object.assign({}, this.config.params), params) : params;
        }
        else {
            this.config.params = params;
        }
        return this;
    }
    getData() {
        return this.promise.then((item) => item.data);
    }
}
_a = Symbol.toStringTag;
class RequestChain {
    constructor(options, config) {
        this.config = config;
        this.local = options.local;
        this.interceptor = options.interceptor;
        this.memoryCache = new MemoryCache();
        this._request = options.request;
    }
    setMemoryCache(key, data, expires) {
        this.memoryCache.set(key, data, expires);
        return this;
    }
    getMemoryCache(key) {
        return this.memoryCache.get(key);
    }
    deleteMemoryCache(key) {
        this.memoryCache.delete(key);
        return this;
    }
    getLocalCache(key) {
        if (!this.local) {
            return null;
        }
        return this.local.get(key);
    }
    setLocalCache(key, data, expires) {
        if (!this.local) {
            return this;
        }
        this.local.set(key, data, expires);
        return this;
    }
    deleteLocalCache(key) {
        if (!this.local) {
            return this;
        }
        this.local.delete(key);
        return this;
    }
    getMobileUserAgent(type = "Android") {
        return type === "Android"
            ? "Mozilla/5.0 (Linux; U; Android 9; zh-cn; Redmi Note 8 Build/PKQ1.190616.001) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/71.0.3578.141 Mobile Safari/537.36 XiaoMi/MiuiBrowser/12.5.22"
            : "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.";
    }
    getPcUserAgent(type = "Windows") {
        return type === "Windows"
            ? "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0"
            : "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.2 Safari/605.1.15";
    }
    request(config) {
        var _b;
        return new RequestChainResponse(Object.assign(Object.assign(Object.assign({ timeout: 10000 }, this.config), config), { headers: Object.assign(Object.assign({}, (_b = this.config) === null || _b === void 0 ? void 0 : _b.headers), config.headers) }), {
            local: this.local,
            memory: this.memoryCache,
            interceptor: this.interceptor,
            request: this._request,
        });
    }
    get(url, params) {
        return this.request({
            method: "GET",
            params,
            url,
        });
    }
    post(url, data, params) {
        return this.request({
            method: "POST",
            params,
            data,
            url,
        });
    }
    put(url, data, params) {
        return this.request({
            method: "PUT",
            params,
            data,
            url,
        });
    }
    delete(url, params) {
        return this.request({
            method: "DELETE",
            params,
            url,
        });
    }
}
export default RequestChain;
