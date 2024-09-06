"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const content_disposition_1 = __importDefault(require("content-disposition"));
class Downloader {
    constructor(options) {
        this.tasks = [];
        this.status = [];
        this.config = {
            method: "GET",
            url: "",
            responseType: "stream",
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
        this.temp_path =
            options.temp_path || path_1.default.join(os_1.default.tmpdir(), "REQUEST_CHAIN");
        fs_1.default.mkdirSync(this.temp_path, { recursive: true });
        let headers = {};
        this.get_file_info_promise = new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
            try {
                const [url] = this.config.url.split("?");
                let name = url.split("/").pop() || "";
                let etag = "";
                let file_size = 0;
                if (options.fetchFileInfo) {
                    const response = yield options.fetchFileInfo(this.config);
                    name = response.name;
                    file_size = response.file_size;
                }
                else {
                    try {
                        const response = yield this.request(Object.assign(Object.assign({}, this.config), { method: "HEAD", url: this.config.url, mergeSame: true, cache: "memory" }));
                        headers = Object.assign({}, response.headers);
                        if (response.headers["content-disposition"]) {
                            const info = content_disposition_1.default.parse(response.headers["content-disposition"]);
                            name = info.parameters.filename;
                        }
                        file_size = Number(response.headers["content-length"]);
                        etag = response.headers["etag"];
                    }
                    catch (error) {
                        const response = yield this.request(Object.assign(Object.assign({}, this.config), { method: "GET", url: this.config.url, mergeSame: true, cache: "memory", headers: Object.assign(Object.assign({}, this.config.headers), { Range: `bytes=${0}-${1}` }) }));
                        headers = Object.assign({}, response.headers);
                        if (response.headers["content-disposition"]) {
                            const info = content_disposition_1.default.parse(response.headers["content-disposition"]);
                            name = info.parameters.filename;
                        }
                        file_size =
                            Number((response.headers["content-range"] || "").split("/").pop()) || 0;
                        etag = response.headers["etag"];
                    }
                }
                const key = `${name}@@${file_size}`;
                const temp_dir = path_1.default.join(this.temp_path, key);
                fs_1.default.mkdirSync(temp_dir, { recursive: true });
                resolve({
                    file_size,
                    name,
                    key,
                    temp_dir,
                    etag,
                    headers,
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
                                start: start,
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
            const file_info = yield this.getFileInfo();
            const file_path = path_1.default.join(file_info.temp_dir, part_info.part_name);
            const isExistFile = fs_1.default.existsSync(file_path);
            let start = part_info.start;
            const end = part_info.end;
            if (isExistFile) {
                const part_stat = fs_1.default.statSync(file_path);
                if (part_stat.size >= part_info.part_size) {
                    const promise = new Promise((resolve, reject) => {
                        fs_1.default.readFile(file_path, (err, data) => {
                            if (err) {
                                reject(err);
                            }
                            else {
                                resolve(data);
                            }
                        });
                    });
                    this.status[part] = "pending";
                    this.tasks[part] = {
                        promise,
                        abort: () => {
                            task.abort();
                        },
                    };
                    this.notifyStatus(part);
                    promise
                        .then(() => {
                        this.status[part] = "done";
                        this.notifyStatus(part);
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
                    return promise;
                }
                start += part_stat.size + 1;
            }
            const writer = fs_1.default.createWriteStream(file_path, { flags: "a" });
            const params = Object.assign(Object.assign({}, this.config), { params: Object.assign(Object.assign({}, this.config.data), data), headers: Object.assign(Object.assign({}, this.config.headers), { Range: `bytes=${start}-${end}`, 
                    // "If-Range": file_info.etag ?? undefined,
                    "If-Range": file_info.etag ? `"${file_info.etag}"` : undefined }), onDownloadProgress: (value) => {
                    this.progress[part] = {
                        loaded: Math.round((value.progress || 0) * part_info.part_size),
                        total: part_info.part_size,
                        name: part_info.part_name,
                        progress: Math.round((value.progress || 0) * 100),
                    };
                    this.notifyProgress();
                } });
            const task = this.request(params);
            const promise = new Promise((resolve, reject) => {
                let data = [];
                task
                    .then((response) => {
                    response.data.pipe(writer);
                    response.data.on("data", (chunk) => {
                        data.push(chunk);
                    });
                    response.data.on("end", () => {
                        const buffer = Buffer.concat(data);
                        data = [];
                        resolve(buffer);
                    });
                    response.data.on("error", (error) => {
                        data = [];
                        reject(error);
                    });
                })
                    .catch(reject);
            });
            this.tasks[part] = {
                promise,
                abort: () => {
                    task.abort();
                },
            };
            this.notifyStatus(part);
            promise
                .then(() => {
                this.status[part] = "done";
                this.notifyStatus(part);
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
            return promise;
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
     * 通过part下载,该part将进入完成状态
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
            if (status.length === this.tasks.length && !isPause && !isPending) {
                const response = yield Promise.allSettled(this.tasks.map((item) => item.promise));
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
     * 开始下载
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
    /**
     *
     * @param save_path 可为文件夹 也可为具体文件
     * @returns
     */
    save(save_path) {
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
            return new Promise((resolve, reject) => {
                const file_path = path_1.default.extname(save_path)
                    ? save_path
                    : path_1.default.join(save_path, file.name);
                fs_1.default.writeFile(file_path, Buffer.concat(blobs), (err) => {
                    if (err) {
                        reject(false);
                    }
                    else {
                        resolve(true);
                    }
                });
            });
        });
    }
    /**
     * 删除下载的缓存
     */
    deleteDownloadTemp() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.isDestroyed) {
                return Promise.reject("任务已被销毁");
            }
            const file = yield this.getFileInfo();
            const isExist = fs_1.default.existsSync(file.temp_dir);
            if (!isExist) {
                return true;
            }
            this.tasks = [];
            return new Promise((resolve, reject) => {
                fs_1.default.rm(file.temp_dir, { force: true, recursive: true }, (err) => {
                    if (err) {
                        reject(false);
                    }
                    else {
                        resolve(true);
                    }
                });
            });
        });
    }
    /**
     * 销毁实例 释放内存,清空下载缓存
     */
    destroyed() {
        return __awaiter(this, void 0, void 0, function* () {
            this.deleteDownloadTemp();
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
exports.default = Downloader;
