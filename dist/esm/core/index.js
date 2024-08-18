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
    constructor(config, chain) {
        this[_a] = "RequestChainResponse";
        this.config = config;
        const request = config.request;
        this.abortController = new AbortController();
        this.chain = chain;
        this.promise = new Promise((resolve, reject) => {
            setTimeout(() => __awaiter(this, void 0, void 0, function* () {
                var _b, _c;
                try {
                    const interceptor = (_b = this.config.interceptor) !== null && _b !== void 0 ? _b : {};
                    const { handleRequest, handleResonse, handleError, handleAlert } = interceptor;
                    if (handleRequest) {
                        yield handleRequest(this);
                    }
                    let { url, baseUrl = "", mergeSame, cache, expires } = this.config;
                    url = url.startsWith("http") ? url : `${baseUrl}${this.config.url}`;
                    const [host, query] = (_c = url.split("?")) !== null && _c !== void 0 ? _c : ["", ""];
                    const urlParams = Object.assign(Object.assign({}, qs.parse(query)), this.config.params);
                    url = host + "?" + qs.stringify(urlParams);
                    let key = "";
                    if (!!cache || mergeSame) {
                        key = `${this.config.method}${host}(${this.serializeParams(urlParams)})(${this.serializeParams(this.config.data)})`;
                        const md5 = new SparkMd5();
                        md5.append(key);
                        key = md5.end();
                        const cacheData = chain.getMemoryCache(key);
                        // console.log("getMemoryCache", cacheData, key);
                        if (cacheData) {
                            if (cacheData.then) {
                                cacheData.then(resolve, reject);
                            }
                            else {
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
                    const createRequest = () => __awaiter(this, void 0, void 0, function* () {
                        try {
                            const response = yield request(Object.assign(Object.assign({ signal: this.abortController.signal }, this.config), { url, params: undefined }), this);
                            if (handleResonse) {
                                const result = yield handleResonse(response, this.config);
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
                                chain.setLocalCache(key, Object.assign(Object.assign({}, response), { request: undefined, Socket: undefined }), expires);
                            }
                            return response;
                        }
                        catch (error) {
                            if (this.config.replay && this.config.replay > 0) {
                                this.config.replay--;
                                return createRequest();
                            }
                            chain.deleteMemoryCache(key);
                            if (handleError) {
                                try {
                                    const result = yield handleError(error, this);
                                    if (result) {
                                        return result;
                                    }
                                }
                                catch (error) {
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
                    });
                    const promise = createRequest();
                    // 执行时缓存不管成功还是失败;
                    if (mergeSame || cache) {
                        chain.setMemoryCache(key, promise);
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
     * 重建请求类
     */
    rebuild(config) {
        return new RequestChainResponse(Object.assign(Object.assign({}, this.config), config), this.chain);
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
    abort() {
        if (this.abortController) {
            this.abortController.abort();
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
    constructor(config, interceptor) {
        this.config = Object.assign(Object.assign({}, config), { localCache: undefined });
        this.localCache = config.localCache;
        this.interceptor = interceptor;
        this.memoryCache = new MemoryCache();
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
        if (!this.localCache) {
            return null;
        }
        return this.localCache.get(key);
    }
    setLocalCache(key, data, expires) {
        if (!this.localCache) {
            return this;
        }
        this.localCache.set(key, data, expires);
        return this;
    }
    deleteLocalCache(key) {
        if (!this.localCache) {
            return this;
        }
        this.localCache.delete(key);
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
        return new RequestChainResponse(Object.assign(Object.assign(Object.assign({ timeout: 2000 }, this.config), config), { interceptor: Object.assign(Object.assign({}, this.interceptor), config.interceptor), request: this.config.request }), this);
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
