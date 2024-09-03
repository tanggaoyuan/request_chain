var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { IndexDBCache } from "./cache";
const store = new IndexDBCache("downloads");
class Downloader {
    constructor(options) {
        this.tasks = [];
        this.status = [];
        this.config = {
            method: "GET",
            url: "",
            responseType: "blob",
        };
        this.events = new Map();
        this.progress = [];
        this.concurrent = 1;
        this.isDestroyed = false;
        /**
         * 上传速度监听
         */
        this.speedRef = 0;
        this.speedsize = [];
        const callback = [null, null];
        this.downloader = {
            callback,
            promise: new Promise((resolve, reject) => {
                callback[0] = resolve;
                callback[1] = reject;
            }),
        };
        this.concurrent = options.concurrent || 1;
        this.request = options.request;
        this.config.url = options.url;
        this.part_size = options.part_size;
        this.get_file_info_promise = new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
            try {
                const [url] = this.config.url.split("?");
                let name = url.split("/").pop() || "";
                let file_size = 0;
                if (options.fetchFileInfo) {
                    const response = yield options.fetchFileInfo();
                    name = response.name;
                    file_size = response.file_size;
                }
                else {
                    const response = yield this.request(Object.assign(Object.assign({}, this.config), { method: "HEAD", url: this.config.url, mergeSame: true, cache: "memory" }));
                    file_size = Number(response.headers["content-length"]);
                }
                const key = `${name}@@${file_size}`;
                resolve({
                    file_size,
                    name,
                    key,
                });
            }
            catch (error) {
                reject(error);
            }
        }));
        this.getParts().then((parts) => {
            parts.forEach((__, index) => {
                this.status[index] = "pause";
            });
        });
    }
    setConfig(config, mix = true) {
        this.config = mix
            ? Object.assign(Object.assign({}, this.config), config) : config;
        return this;
    }
    getFileInfo() {
        if (this.isDestroyed) {
            return Promise.reject("任务已被销毁");
        }
        return this.get_file_info_promise;
    }
    getParts() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.isDestroyed) {
                return Promise.reject("任务已被销毁");
            }
            if (!this.get_parts_promise) {
                const info = yield this.getFileInfo();
                this.get_parts_promise = new Promise((resolve) => {
                    const parts = [];
                    if (this.part_size) {
                        const part_count = Math.ceil(info.file_size / this.part_size);
                        for (let i = 0; i < part_count; i++) {
                            const start = i * this.part_size;
                            const end = Math.min(info.file_size, (i + 1) * this.part_size);
                            parts.push({
                                part_count,
                                part_index: i,
                                part_name: `${info.name}.part${i + 1}`,
                                start,
                                end: end === info.file_size ? end : end - 1,
                                total: info.file_size,
                                name: info.name,
                                part_size: end - start,
                            });
                        }
                    }
                    else {
                        parts.push({
                            part_count: 1,
                            part_index: 0,
                            part_name: `${info.name}.part1`,
                            start: 0,
                            end: info.file_size,
                            total: info.file_size,
                            name: info.name,
                            part_size: info.file_size,
                        });
                    }
                    resolve(parts);
                });
            }
            return this.get_parts_promise;
        });
    }
    onProgress(fn) {
        const events = this.events.get("ON_PROGRESS") || [];
        events.push(fn);
        this.events.set("ON_PROGRESS", events);
    }
    notifyProgress() {
        return __awaiter(this, void 0, void 0, function* () {
            const events = this.events.get("ON_PROGRESS") || [];
            if (!events.length) {
                return;
            }
            let loaded = 0;
            this.progress.forEach((item) => {
                loaded += item.loaded;
            });
            const info = yield this.getFileInfo();
            const params = {
                loaded,
                total: info.file_size,
                progress: Math.round((loaded / info.file_size) * 100),
            };
            events.forEach((fn) => {
                fn(params, this.progress);
            });
        });
    }
    onStatus(fn) {
        const events = this.events.get("ON_STATUS") || [];
        events.push(fn);
        this.events.set("ON_STATUS", events);
        this.notifyStatus(-1);
    }
    notifyStatus(part) {
        const events = this.events.get("ON_STATUS") || [];
        if (!events.length) {
            return;
        }
        events.forEach((fn) => {
            fn(this.status, part);
        });
    }
    startPart(part_1) {
        return __awaiter(this, arguments, void 0, function* (part, data = {}) {
            if (this.isDestroyed) {
                return Promise.reject("任务已被销毁");
            }
            const parts = yield this.getParts();
            const part_info = parts[part];
            if (["done", "pending", "stop"].includes(this.status[part])) {
                const task = this.tasks[part] || {
                    promise: Promise.reject(Object.assign({ status: this.status[part] }, part_info)),
                    abort: () => { },
                };
                this.tasks[part] = task;
                return task.promise;
            }
            this.status[part] = "pending";
            this.notifyStatus(part);
            const result = yield this.getChache(part).catch(() => undefined);
            if (result) {
                this.progress[part] = {
                    loaded: result.part_size,
                    total: result.part_size,
                    name: result.part_name,
                    progress: 100,
                };
                this.status[part] = "done";
                this.notifyStatus(part);
                this.notifyProgress();
                this.finishing();
                const promise = Promise.resolve(result.chunk);
                this.tasks[part] = {
                    promise,
                    abort: () => { },
                };
                return promise;
            }
            const params = Object.assign(Object.assign({}, this.config), { params: Object.assign(Object.assign({}, this.config.data), data), headers: Object.assign(Object.assign({}, this.config.headers), { Range: `bytes=${part_info.start}-${part_info.end}` }), onDownloadProgress: (value) => {
                    this.progress[part] = {
                        loaded: Math.round((value.progress || 0) * part_info.part_size),
                        total: part_info.part_size,
                        name: part_info.part_name,
                        progress: Math.round((value.progress || 0) * 100),
                    };
                    this.notifyProgress();
                } });
            const task = this.request(params);
            this.tasks[part] = {
                promise: task.getData(),
                abort: () => {
                    task.abort();
                },
            };
            task
                .then((response) => {
                this.status[part] = "done";
                this.notifyStatus(part);
                this.setChache(part, response.data);
            })
                .catch(() => {
                if (this.status[part] !== "stop") {
                    this.status[part] = "pause";
                    this.notifyStatus(part);
                }
            })
                .finally(() => {
                this.finishing();
            });
            return task.then((response) => response.data);
        });
    }
    /**
     * part 暂停当前切片任务,所有任务结束时，upload处于等待中
     * 下载大小小于size时,终止请求
     */
    pausePart(part, size = Infinity) {
        var _a;
        if (this.isDestroyed) {
            return Promise.reject("任务已被销毁");
        }
        if (this.status[part] !== "pending") {
            return;
        }
        if (this.progress[part].loaded < size) {
            this.status[part] = "pause";
            (_a = this.tasks[part]) === null || _a === void 0 ? void 0 : _a.abort();
            this.notifyStatus(part);
        }
    }
    /**
     * 停止当前任务，所有任务结束时，upload返回结果
     */
    stopPart(part) {
        var _a;
        if (this.isDestroyed) {
            return Promise.reject("任务已被销毁");
        }
        if (this.status[part] === "done") {
            return;
        }
        this.status[part] = "stop";
        (_a = this.tasks[part]) === null || _a === void 0 ? void 0 : _a.abort();
        this.notifyStatus(part);
    }
    /**
     * 跳过part上传,该part将进入完成状态
     */
    skipPart(part, data) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.isDestroyed) {
                return Promise.reject("任务已被销毁");
            }
            const parts = yield this.getParts();
            this.status[part] = "done";
            this.tasks[part] = {
                promise: Promise.resolve(data),
                abort: () => { },
            };
            this.progress[part] = {
                loaded: parts[part].part_size,
                total: parts[part].part_size,
                progress: 100,
                name: parts[part].part_name,
            };
            this.notifyStatus(part);
            this.notifyProgress();
            this.finishing();
            return this.tasks[part].promise;
        });
    }
    onSpeed(fn) {
        const events = this.events.get("ON_SPEED") || [];
        events.push(fn);
        this.events.set("ON_SPEED", events);
        if (!this.speedRef) {
            this.speedRef = window.setInterval(() => {
                const events = this.events.get("ON_SPEED") || [];
                this.finishing().finally(() => {
                    clearInterval(this.speedRef);
                    events.forEach((fn) => {
                        fn(0, Array(parts.length).fill(0));
                    });
                });
                if (!events.length) {
                    return;
                }
                let totalSpeed = 0;
                let parts = [];
                this.progress.forEach((item, index) => {
                    const speed = item.loaded - (this.speedsize[index] || 0);
                    parts[index] = speed;
                    totalSpeed += speed;
                    this.speedsize[index] = item.loaded;
                });
                events.forEach((fn) => {
                    fn(totalSpeed, parts);
                });
            }, 1000);
        }
    }
    /**
     * 等待所有任务结束，返回结果
     */
    finishing() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.isDestroyed) {
                return Promise.reject("任务已被销毁");
            }
            const status = this.status.filter((value) => value);
            const isPause = status.some((value) => value === "pause");
            const isPending = status.some((value) => value === "pending");
            const response = yield Promise.allSettled(this.tasks.map((item) => {
                return item.promise;
            }));
            if (status.length === this.tasks.length && !isPause && !isPending) {
                const results = [];
                response.forEach((item) => {
                    if (item.status === "fulfilled") {
                        results.push({
                            status: "done",
                            data: item.value,
                            error: null,
                        });
                    }
                    else {
                        results.push({
                            status: "stop",
                            error: item.reason,
                            data: null,
                        });
                    }
                });
                this.downloader.callback[0](results);
            }
            return this.downloader.promise;
        });
    }
    /**
     * 开始上传
     */
    download() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.isDestroyed) {
                return Promise.reject("任务已被销毁");
            }
            const parts = yield this.getParts();
            const promises = parts.map((_, index) => {
                return () => this.startPart(index);
            });
            const limitConcurrency = (promises, limit) => {
                let index = 0;
                const runNext = () => __awaiter(this, void 0, void 0, function* () {
                    if (index >= promises.length) {
                        return;
                    }
                    const currentIndex = index++;
                    try {
                        yield promises[currentIndex]();
                    }
                    catch (error) {
                    }
                    finally {
                        yield runNext();
                    }
                });
                const tasks = Array.from({ length: Math.min(limit, promises.length) }, () => runNext());
                Promise.all(tasks);
            };
            limitConcurrency(promises, this.concurrent);
            return this.finishing();
        });
    }
    setChache(part, chunk) {
        return __awaiter(this, void 0, void 0, function* () {
            const file = yield this.getFileInfo();
            const parts = yield this.getParts();
            return store.set(`${file.key}@@${part}`, Object.assign(Object.assign({}, parts[part]), { chunk }));
        });
    }
    getChache(part) {
        return __awaiter(this, void 0, void 0, function* () {
            const file = yield this.getFileInfo();
            return store.get(`${file.key}@@${part}`);
        });
    }
    clearChache() {
        return __awaiter(this, void 0, void 0, function* () {
            const file = yield this.getFileInfo();
            const parts = yield this.getParts();
            for (let index = 0; index > parts.length; index++) {
                yield store.delete(`${file.key}@@${index}`);
            }
        });
    }
    save(name) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.isDestroyed) {
                return Promise.reject("任务已被销毁");
            }
            if (!this.status.every((value) => value === "done")) {
                return Promise.reject(new Error("文件未下载完成"));
            }
            const file = yield this.getFileInfo();
            const response = yield this.finishing();
            const blobs = [];
            for (const value of response) {
                if (value.status === "stop") {
                    return Promise.reject(new Error("文件下载异常"));
                }
                blobs.push(value.data);
            }
            const url = URL.createObjectURL(new Blob(blobs));
            const a = document.createElement("a");
            a.href = url;
            a.download = name || file.name;
            document.body.append(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        });
    }
    /**
     * 销毁实例 释放内存,清空indexDb缓存
     */
    destroyed() {
        return __awaiter(this, void 0, void 0, function* () {
            this.clearChache();
            this.tasks = [];
            this.get_parts_promise = undefined;
            this.get_file_info_promise = undefined;
            this.downloader[1]("任务已被销毁");
            this.downloader.promise = Promise.reject("任务已被销毁");
            this.isDestroyed = true;
            this.events = new Map();
        });
    }
}
export default Downloader;
