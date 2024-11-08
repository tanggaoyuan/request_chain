var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import fs from "fs";
import path from "path";
import os from "os";
import ContentDisposition from "content-disposition";
import { PassThrough } from "stream";
import { getMd5 } from "./md5";
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
        this.speedsize = [];
        const callback = [null, null];
        this.downloader = {
            callback,
            promise: new Promise((resolve, reject) => {
                callback[0] = resolve;
                callback[1] = reject;
            }),
        };
        this.request = options.request;
        this.config.url = options.url;
        this.part_size = options.part_size;
        this.temp_path =
            options.temp_path || path.join(os.tmpdir(), "REQUEST_CHAIN");
        fs.mkdirSync(this.temp_path, { recursive: true });
        let headers = {};
        this.get_file_info_promise = new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
            try {
                const [url] = this.config.url.split("?");
                let name = url.split("/").pop() || "";
                let etag = "";
                let file_size = 0;
                let mine_type = "";
                if (options.fetchFileInfo) {
                    const response = yield options.fetchFileInfo(this.config);
                    name = response.name;
                    file_size = response.file_size;
                    mine_type = response.mine_type || "";
                }
                else {
                    try {
                        const response = yield this.request(Object.assign(Object.assign({}, this.config), { method: "HEAD", url: this.config.url, mergeSame: true, cache: "local" }));
                        headers = Object.assign({}, response.headers);
                        if (response.headers["content-disposition"]) {
                            const info = ContentDisposition.parse(response.headers["content-disposition"]);
                            name = info.parameters.filename;
                        }
                        mine_type = response.headers["content-type"] || "";
                        file_size = Number(response.headers["content-length"]);
                        etag = response.headers["etag"];
                    }
                    catch (error) {
                        const response = yield this.request(Object.assign(Object.assign({}, this.config), { method: "GET", url: this.config.url, mergeSame: true, headers: Object.assign(Object.assign({}, this.config.headers), { Range: `bytes=${0}-${1}` }) }));
                        headers = Object.assign({}, response.headers);
                        if (response.headers["content-disposition"]) {
                            const info = ContentDisposition.parse(response.headers["content-disposition"]);
                            name = info.parameters.filename;
                        }
                        mine_type = response.headers["content-type"] || "";
                        file_size =
                            Number((response.headers["content-range"] || "").split("/").pop()) ||
                                Number(response.headers["content-length"]) ||
                                0;
                        etag = response.headers["etag"];
                    }
                }
                const features = url.replace(/(http|https):\/\/(.+?)\//g, "");
                const key = yield getMd5(`${features}@@${name}@@${file_size}`);
                const temp_dir = path.join(this.temp_path, key);
                fs.mkdirSync(temp_dir, { recursive: true });
                resolve({
                    file_size,
                    name,
                    key,
                    temp_dir,
                    etag,
                    headers,
                    mine_type,
                });
            }
            catch (error) {
                reject(error);
            }
        }));
        this.getParts().then((parts) => {
            parts.forEach((__, index) => {
                this.status[index] = "wait";
            });
        });
    }
    setConfig(config, mix = true) {
        this.config = mix
            ? Object.assign(Object.assign({}, this.config), config) : config;
        return this;
    }
    getFileInfo() {
        return this.get_file_info_promise;
    }
    getParts() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.get_parts_promise) {
                const info = yield this.getFileInfo();
                this.get_parts_promise = new Promise((resolve) => {
                    const parts = [];
                    if (this.part_size) {
                        const part_count = Math.ceil(info.file_size / this.part_size);
                        for (let i = 0; i < part_count; i++) {
                            const start = i * this.part_size;
                            const end = Math.min(info.file_size, start + this.part_size) - 1;
                            parts.push({
                                part_count,
                                part_index: i,
                                part_name: `${info.name}.part${i}`,
                                start: start,
                                end: end,
                                total: info.file_size,
                                name: info.name,
                                part_size: end - start + 1,
                                temp_dir: info.temp_dir,
                                temp_path: path.join(info.temp_dir, `${info.name}.part${i}`),
                            });
                        }
                    }
                    else {
                        parts.push({
                            part_count: 1,
                            part_index: 0,
                            part_name: `${info.name}.part0`,
                            start: 0,
                            end: info.file_size,
                            total: info.file_size,
                            name: info.name,
                            part_size: info.file_size,
                            temp_dir: info.temp_dir,
                            temp_path: path.join(info.temp_dir, `${info.name}.part0`),
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
        return () => {
            const index = events.indexOf(fn);
            events.splice(index, 1);
        };
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
            if (this.oldLoaded === loaded) {
                return;
            }
            this.oldLoaded = loaded;
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
        return () => {
            const index = events.indexOf(fn);
            events.splice(index, 1);
        };
    }
    notifyStatus(part, status) {
        const events = this.events.get("ON_STATUS") || [];
        if (status === this.status[part]) {
            return;
        }
        this.status[part] = status;
        events.forEach((fn) => {
            fn(this.status, part);
        });
    }
    /**
     *
     * @param part
     * @param options
     * @returns
     */
    startPart(part, options) {
        return __awaiter(this, void 0, void 0, function* () {
            const parts = yield this.getParts();
            const part_info = parts[part];
            const { useCache = true, preloaded } = options || {};
            if (this.tasks[part]) {
                return this.tasks[part].promise;
            }
            if (["stop"].includes(this.status[part])) {
                return Promise.reject("当前任务已停止");
            }
            const file_info = yield this.getFileInfo();
            const file_path = path.join(file_info.temp_dir, part_info.part_name);
            let start = part_info.start;
            let end = part_info.end;
            let cache_size = 0;
            const stream = new PassThrough();
            const done = () => {
                const progress = {
                    loaded: part_info.part_size,
                    total: part_info.part_size,
                    name: part_info.part_name,
                    progress: 100,
                };
                stream.emit("progress", progress);
                this.progress[part] = progress;
                this.notifyStatus(part, end !== part_info.end ? "wait" : "done");
                this.notifyProgress();
                this.end();
            };
            stream.on("done", done);
            stream.on("error", () => {
                this.end();
            });
            if (fs.existsSync(file_path)) {
                const part_stat = fs.statSync(file_path);
                cache_size = part_stat.size;
            }
            const run = () => __awaiter(this, void 0, void 0, function* () {
                var _a;
                try {
                    let read;
                    if (useCache && fs.existsSync(file_path)) {
                        start += cache_size;
                        read = fs.createReadStream(file_path);
                        if (cache_size >= part_info.part_size) {
                            read.on("data", (chunk) => {
                                stream.write(chunk);
                            });
                            read.on("error", (error) => {
                                stream.destroy(error);
                            });
                            read.on("end", () => {
                                stream.end();
                                stream.emit("done");
                            });
                            return;
                        }
                        yield new Promise((resolve, reject) => {
                            read.on("data", (chunk) => {
                                stream.write(chunk);
                            });
                            read.on("end", resolve);
                            read.on("error", (error) => {
                                stream.destroy(error);
                                reject(error);
                            });
                        });
                    }
                    if (preloaded) {
                        end = Math.min(part_info.end, start + preloaded - 1);
                    }
                    const params = Object.assign(Object.assign({}, this.config), { headers: Object.assign(Object.assign({ "If-Range": (_a = file_info.etag) !== null && _a !== void 0 ? _a : undefined }, this.config.headers), { Range: `bytes=${start}-${end}` }), onDownloadProgress: (value) => {
                            const loaded = cache_size + value.loaded;
                            const progress = {
                                loaded: loaded,
                                total: part_info.part_size,
                                name: part_info.part_name,
                                progress: Math.round((loaded / part_info.part_size) * 100),
                            };
                            stream.emit("progress", progress);
                            this.progress[part] = progress;
                            this.notifyProgress();
                        } });
                    const task = this.request(params);
                    stream.on("close", () => {
                        task.abort();
                    });
                    this.tasks[part] = {
                        promise: stream,
                        abort: () => {
                            task.abort();
                        },
                    };
                    this.notifyStatus(part, "pending");
                    const response = yield task;
                    response.data.on("data", (chunk) => {
                        stream.write(chunk);
                    });
                    if ((!useCache && cache_size < preloaded) || useCache) {
                        const writer = fs.createWriteStream(file_path, useCache
                            ? { flags: "a" }
                            : {
                                start: 0,
                            });
                        response.data.pipe(writer);
                        writer.on("close", () => {
                            stream.end();
                            stream.emit("done");
                        });
                    }
                    else {
                        response.data.on("end", () => {
                            stream.end();
                            stream.emit("done");
                        });
                    }
                    response.data.on("close", () => {
                        this.tasks[part] = null;
                    });
                    response.data.on("error", (error) => {
                        stream.destroy(error);
                        this.tasks[part] = null;
                    });
                    this.config.headers = Object.assign({ "If-Range": response.headers["etag"] || undefined }, this.config.headers);
                }
                catch (error) {
                    stream.destroy(error);
                }
            });
            run();
            return stream;
        });
    }
    waitPartStream(stream) {
        return new Promise((resolve, reject) => {
            stream.on("done", resolve);
            stream.on("error", reject);
        });
    }
    waitPartDone(part) {
        return __awaiter(this, void 0, void 0, function* () {
            if (["done", "stop"].includes(this.status[part])) {
                return;
            }
            const stream = yield this.startPart(part);
            return this.waitPartStream(stream);
        });
    }
    /**
     * part 暂停当前切片任务,所有任务结束时，finish处于等待中
     */
    pausePart(part) {
        var _a;
        if (this.status[part] !== "pending" || !this.tasks[part]) {
            return;
        }
        this.notifyStatus(part, "wait");
        (_a = this.tasks[part]) === null || _a === void 0 ? void 0 : _a.abort();
        this.tasks[part] = null;
    }
    /**
     * 停止当前任务，所有任务结束时，finish返回结果
     */
    stopPart(part) {
        var _a;
        if (this.status[part] === "done" || !this.status[part]) {
            return;
        }
        this.notifyStatus(part, "stop");
        (_a = this.tasks[part]) === null || _a === void 0 ? void 0 : _a.abort();
        this.tasks[part] = null;
    }
    onSpeed(fn) {
        const events = this.events.get("ON_SPEED") || [];
        events.push(fn);
        this.events.set("ON_SPEED", events);
        if (!this.speedRef) {
            this.speedRef = setInterval(() => {
                const events = this.events.get("ON_SPEED") || [];
                if (!events.length) {
                    return;
                }
                const status = this.status;
                const isPause = status.some((value) => value === "wait");
                const isPending = status.some((value) => value === "pending");
                if (status.length &&
                    status.length === this.tasks.length &&
                    !isPause &&
                    !isPending) {
                    clearInterval(this.speedRef);
                    this.downloader.callback[0](this.status);
                }
                let totalSpeed = 0;
                let oldSpeed = this.speedsize.length
                    ? this.speedsize.reduce((a, b) => a + b, 0)
                    : undefined;
                let parts = [];
                this.progress.forEach((item, index) => {
                    const speed = item.loaded - (this.speedsize[index] || 0);
                    parts[index] = speed;
                    totalSpeed += speed;
                    this.speedsize[index] = item.loaded;
                });
                if (oldSpeed === totalSpeed) {
                    return;
                }
                events.forEach((fn) => {
                    fn(totalSpeed, parts);
                });
            }, 1000);
        }
        return () => {
            clearInterval(this.speedRef);
            const index = events.indexOf(fn);
            events.splice(index, 1);
        };
    }
    /**
     * 等待所有任务结束，返回状态
     */
    end() {
        return __awaiter(this, void 0, void 0, function* () {
            const parts = yield this.getParts();
            const status = this.status;
            const isPause = status.some((value) => value === "wait");
            const isPending = status.some((value) => value === "pending");
            if (status.length &&
                status.length === parts.length &&
                !isPause &&
                !isPending) {
                clearInterval(this.speedRef);
                this.downloader.callback[0](this.status);
            }
            return this.downloader.promise;
        });
    }
    /**
     * 等待所有任务结束，返回结果
     */
    finishing() {
        return __awaiter(this, void 0, void 0, function* () {
            const status = yield this.end();
            const tasks = [];
            for (let i = 0; i < status.length; i++) {
                const stream = yield this.startPart(i);
                tasks.push({
                    stream,
                    status: status[i],
                });
            }
            return tasks;
        });
    }
    /**
     * 开始下载
     */
    download() {
        return __awaiter(this, arguments, void 0, function* (concurrent = 1) {
            const parts = yield this.getParts();
            const promises = parts.map((_, index) => {
                return () => this.waitPartDone(index);
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
            limitConcurrency(promises, concurrent);
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
            if (!this.status.length) {
                return Promise.reject("未检测到下载，请执行download");
            }
            const status = yield this.end();
            if (!status.every((value) => value === "done")) {
                return Promise.reject(new Error("文件未下载完成"));
            }
            const file = yield this.getFileInfo();
            const tasks = yield this.finishing();
            let file_path = save_path;
            let file_name = file.name;
            if (path.extname(save_path)) {
                file_path = path.dirname(save_path);
                file_name = path.basename(save_path);
            }
            fs.mkdirSync(file_path, { recursive: true });
            const stream = fs.createWriteStream(path.join(file_path, file_name));
            for (const task of tasks) {
                if (task.status !== "done") {
                    continue;
                }
                yield new Promise((resolve, reject) => {
                    task.stream.on("data", (chunk) => {
                        stream.write(chunk);
                    });
                    task.stream.on("error", (error) => {
                        reject(error);
                        stream.destroy(error);
                        stream.emit("error");
                    });
                    task.stream.on("end", () => {
                        resolve(true);
                    });
                });
            }
            stream.end();
            stream.emit("end");
            return stream;
        });
    }
    /**
     * 删除下载的缓存
     */
    deleteDownloadTemp() {
        return __awaiter(this, void 0, void 0, function* () {
            const file = yield this.getFileInfo();
            const isExist = fs.existsSync(file.temp_dir);
            if (!isExist) {
                return true;
            }
            this.tasks = [];
            return new Promise((resolve, reject) => {
                fs.rm(file.temp_dir, { force: true, recursive: true }, (err) => {
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
}
export default Downloader;
