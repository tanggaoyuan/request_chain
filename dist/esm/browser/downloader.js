var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
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
        this.openDb = () => {
            return new Promise((resolve, reject) => {
                const indexedDB = window.indexedDB;
                if (!indexedDB) {
                    return Promise.reject(new Error("不支持DB"));
                }
                const request = indexedDB.open("DOWNLOAD_STORE");
                request.onsuccess = function (event) {
                    resolve(event.target.result);
                };
                request.onerror = function (event) {
                    reject(new Error("打开数据库失败"));
                };
                request.onupgradeneeded = function (event) {
                    const db = event.target.result;
                    db.createObjectStore("downloads", { keyPath: "id" });
                };
            });
        };
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
        this.name = options.name;
        this.part_size = options.part_size;
        this.getFileInfo();
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
        return __awaiter(this, void 0, void 0, function* () {
            const response = yield this.request(Object.assign(Object.assign({}, this.config), { method: "HEAD", url: this.config.url, mergeSame: true, cache: "memory" }));
            const total = Number(response.headers["content-length"]);
            const type = response.headers["content-type"];
            const lastModified = response.headers["last-modified"];
            const [url] = this.config.url.split("?");
            const originalName = url.split("/").pop() || "";
            const name = this.name || originalName;
            const key = `${originalName}@@${total}`;
            return { total, type, lastModified, originalName, name, key };
        });
    }
    getParts() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.get_parts_promise) {
                const info = yield this.getFileInfo();
                this.get_parts_promise = new Promise((resolve) => {
                    const parts = [];
                    if (this.part_size) {
                        const part_count = Math.ceil(info.total / this.part_size);
                        for (let i = 0; i < part_count; i++) {
                            const start = i * this.part_size;
                            const end = Math.min(info.total, (i + 1) * this.part_size);
                            parts.push({
                                part_count,
                                part_index: i,
                                part_name: `${info.name}.part${i + 1}`,
                                start,
                                end: end === info.total ? end : end - 1,
                                total: info.total,
                                name: info.originalName,
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
                            end: info.total,
                            total: info.total,
                            name: info.originalName,
                            part_size: info.total,
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
                total: info.total,
                progress: Math.round((loaded / info.total) * 100),
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
        if (this.status[part] === "done") {
            return;
        }
        this.status[part] = "stop";
        (_a = this.tasks[part]) === null || _a === void 0 ? void 0 : _a.abort();
        this.notifyStatus(part);
    }
    /**
     * 通过part上传,该part将进入完成状态
     */
    skipPart(part, data) {
        return __awaiter(this, void 0, void 0, function* () {
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
            var _a, _b;
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
                (_a = this.downloader) === null || _a === void 0 ? void 0 : _a.callback[0](results);
            }
            return (_b = this.downloader) === null || _b === void 0 ? void 0 : _b.promise;
        });
    }
    /**
     * 开始上传
     */
    download() {
        return __awaiter(this, void 0, void 0, function* () {
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
            const db = yield this.openDb();
            const file = yield this.getFileInfo();
            const parts = yield this.getParts();
            return new Promise((resolve, reject) => {
                const task = db
                    .transaction(["downloads"], "readwrite")
                    .objectStore("downloads")
                    .add(Object.assign(Object.assign({}, parts[part]), { chunk, id: `${file.key}@@${part}` }));
                task.onsuccess = resolve;
                task.onerror = reject;
            });
        });
    }
    getChache(part) {
        return __awaiter(this, void 0, void 0, function* () {
            const db = yield this.openDb();
            const file = yield this.getFileInfo();
            const transaction = db.transaction(["downloads"]);
            const objectStore = transaction.objectStore("downloads");
            const request = objectStore.get(`${file.key}@@${part}`);
            return new Promise((resolve, reject) => {
                request.onerror = function () {
                    reject(request.error);
                };
                request.onsuccess = function () {
                    resolve(request.result || false);
                };
            });
        });
    }
    clearChache() {
        return __awaiter(this, void 0, void 0, function* () {
            const db = yield this.openDb();
            const file = yield this.getFileInfo();
            const parts = yield this.getParts();
            const table = db
                .transaction(["downloads"], "readwrite")
                .objectStore("downloads");
            parts.forEach((_, index) => {
                table.delete(`${file.key}@@${index}`);
            });
        });
    }
    save() {
        return __awaiter(this, void 0, void 0, function* () {
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
            a.download = file.name;
            document.body.append(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            return true;
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
            this.downloader = undefined;
            this.isDestroyed = true;
            this.events = new Map();
        });
    }
}
export default Downloader;
