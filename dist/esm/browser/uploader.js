var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { getMd5, getMd5Thread } from "./md5";
class Uploader {
    constructor(options) {
        this.parts = [];
        this.tasks = [];
        this.config = {
            method: "POST",
            url: "",
            headers: { "Content-Type": "multipart/form-data" },
        };
        this.status = [];
        this.events = new Map();
        this.md5s = new Map();
        this.isDestroyed = false;
        this.progress = [];
        this.concurrent = 1;
        this.md5_thread = -1;
        /**
         * 上传速度监听
         */
        this.speedRef = 0;
        this.speedsize = [];
        const callback = [null, null];
        this.uploader = {
            callback,
            promise: new Promise((resolve, reject) => {
                callback[0] = resolve;
                callback[1] = reject;
            }),
        };
        const { file, request, part_size = file.size, url, concurrent = 1, md5_thread = -1, checkpart, } = options;
        this.concurrent = concurrent;
        this.md5_thread = md5_thread;
        this.name = options.name || "file";
        this.file = file;
        this.request = request;
        this.checkpart = checkpart;
        this.config.url = url;
        let part_count = 1;
        if (part_size) {
            part_count = Math.ceil(file.size / part_size);
        }
        for (let i = 0; i < part_count; i++) {
            const start = i * part_size;
            let end = (i + 1) * part_size;
            end = end > file.size ? file.size : end;
            const chunk = file.slice(start, end);
            const part = {
                name: file.name,
                total: file.size,
                lastModified: file.lastModified,
                chunk,
                part_name: `${file.name}.part${i + 1}`,
                part_index: i,
                part_size: chunk.size,
                part_count,
            };
            this.parts.push(part);
            this.progress.push({
                progress: 0,
                total: chunk.size,
                loaded: 0,
                name: part.part_name,
            });
            this.status.push("pause");
        }
    }
    setConfig(config, mix = true) {
        this.config = mix
            ? Object.assign(Object.assign({}, this.config), config) : config;
        return this;
    }
    getParts() {
        return this.parts;
    }
    getPart(index) {
        return this.parts[index];
    }
    /**
     * 计算过的part将会被缓存
     * @param part 获取part的 -1 获取整个文件的md5
     * @param thread 是否启用线程计算
     */
    getMd5(part, thread) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            if (this.md5s.get(part)) {
                return this.md5s.get(part);
            }
            const chunk = part === -1 ? this.file : (_a = this.parts[part]) === null || _a === void 0 ? void 0 : _a.chunk;
            return thread ? getMd5Thread(chunk) : getMd5(chunk);
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
    onProgress(fn) {
        const events = this.events.get("ON_PROGRESS") || [];
        events.push(fn);
        this.events.set("ON_PROGRESS", events);
    }
    notifyProgress() {
        const events = this.events.get("ON_PROGRESS") || [];
        if (!events.length) {
            return;
        }
        let loaded = 0;
        this.progress.forEach((item) => {
            loaded += item.loaded;
        });
        const params = {
            loaded,
            total: this.file.size,
            progress: Math.round((loaded / this.file.size) * 100),
        };
        events.forEach((fn) => {
            fn(params, this.progress);
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
    startPart(part, data = {}) {
        const part_info = this.getPart(part);
        if (["done", "pending", "stop"].includes(this.status[part])) {
            const task = this.tasks[part] || {
                promise: Promise.reject(Object.assign({ status: this.status[part] }, part_info)),
                abort: () => { },
            };
            this.tasks[part] = task;
            return task.promise;
        }
        this.status[part] = "pending";
        const task = this.request(Object.assign(Object.assign({}, this.config), { data: Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, part_info), { chunk: undefined }), this.config.data), data), { [this.name]: part_info.chunk }), onUploadProgress: (value) => {
                this.progress[part] = {
                    loaded: Math.round((value.progress || 0) * part_info.part_size),
                    total: part_info.part_size,
                    name: part_info.part_name,
                    progress: Math.round((value.progress || 0) * 100),
                };
                this.notifyProgress();
            } }));
        this.tasks[part] = {
            promise: task.getData(),
            abort: () => {
                task.abort();
            },
        };
        this.notifyStatus(part);
        task
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
        return task.then((response) => response.data);
    }
    /**
     * 通过part上传,该part将进入完成状态
     */
    skipPart(part, data) {
        this.status[part] = "done";
        this.tasks[part] = {
            promise: Promise.resolve(data),
            abort: () => { },
        };
        this.progress[part] = {
            loaded: this.parts[part].part_size,
            total: this.parts[part].part_size,
            progress: 100,
            name: this.parts[part].part_name,
        };
        this.notifyStatus(part);
        this.notifyProgress();
        this.finishing();
        return this.tasks[part].promise;
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
            const response = yield Promise.allSettled(this.tasks.map((item) => item.promise));
            if (status.length === this.parts.length && !isPause && !isPending) {
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
                (_a = this.uploader) === null || _a === void 0 ? void 0 : _a.callback[0](results);
            }
            const promoise = (_b = this.uploader) === null || _b === void 0 ? void 0 : _b.promise;
            return promoise;
        });
    }
    /**
     * 开始上传
     */
    upload() {
        const promises = this.parts.map((item, index) => {
            return () => __awaiter(this, void 0, void 0, function* () {
                const part = this.parts[index];
                let md5 = undefined;
                if (this.md5_thread === -1) {
                    md5 = undefined;
                }
                else {
                    md5 = yield this.getMd5(index, part.part_size >= this.md5_thread);
                }
                if (this.checkpart) {
                    const result = yield this.checkpart(Object.assign({ md5 }, part));
                    if (result) {
                        return this.skipPart(index, result);
                    }
                    else {
                        return this.startPart(index, { md5 });
                    }
                }
                return this.startPart(index, { md5 });
            });
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
    }
    /**
     * 销毁实例 释放内存
     */
    destroyed() {
        return __awaiter(this, void 0, void 0, function* () {
            this.tasks = [];
            this.parts = [];
            this.uploader = undefined;
            this.isDestroyed = true;
            this.events = new Map();
        });
    }
}
export default Uploader;
