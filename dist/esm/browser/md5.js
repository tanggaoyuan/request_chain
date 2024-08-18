var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import SparkMD5 from "spark-md5";
class Md5Thread {
    constructor() {
        this.open();
    }
    open() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.worker) {
                this.worker = this.createWorker((window) => {
                    const { SparkMD5 } = window;
                    window.onmessage = (event) => __awaiter(this, void 0, void 0, function* () {
                        try {
                            const { chunk } = event.data;
                            const spark = new SparkMD5.ArrayBuffer();
                            const blobSlice = File.prototype.slice;
                            const chunkSize = 2097152;
                            const chunks = Math.ceil(chunk.size / chunkSize);
                            const fileReader = new FileReader();
                            let currentChunk = 0;
                            fileReader.onload = function (e) {
                                var _a;
                                if (!((_a = e.target) === null || _a === void 0 ? void 0 : _a.result)) {
                                    return;
                                }
                                spark.append(e.target.result); // Append array buffer
                                currentChunk++;
                                if (currentChunk < chunks) {
                                    loadNext();
                                }
                                else {
                                    window.postMessage({
                                        type: "done",
                                        data: spark.end(),
                                    });
                                }
                            };
                            fileReader.onerror = function (error) {
                                window.postMessage({ type: "error", error });
                            };
                            function loadNext() {
                                var start = currentChunk * chunkSize, end = start + chunkSize >= chunk.size
                                    ? chunk.size
                                    : start + chunkSize;
                                fileReader.readAsArrayBuffer(blobSlice.call(chunk, start, end));
                            }
                            loadNext();
                        }
                        catch (error) {
                            window.postMessage({ type: "error", error });
                        }
                    });
                });
            }
            return this.worker;
        });
    }
    generateMd5(chunk) {
        return __awaiter(this, void 0, void 0, function* () {
            const worker = yield this.open();
            worker.postMessage({
                chunk,
            });
            return new Promise((resolve, reject) => {
                worker.onmessage = (res) => {
                    const { data, error } = res.data;
                    if (error) {
                        reject(error);
                        worker.terminate();
                    }
                    if (data) {
                        resolve(data);
                        worker.terminate();
                    }
                };
            });
        });
    }
    createWorker(handler) {
        return __awaiter(this, void 0, void 0, function* () {
            //@ts-ignore
            const module = yield import(`spark-md5?raw`);
            const blob = new Blob([`${module.default} (${handler.toString()})(self)`]);
            const url = window.URL.createObjectURL(blob);
            const worker = new Worker(url);
            return worker;
        });
    }
}
export const getMd5Thread = (chunk) => __awaiter(void 0, void 0, void 0, function* () {
    return new Md5Thread().generateMd5(chunk);
});
export const getMd5 = (chunk) => {
    return new Promise((resolve, reject) => {
        const spark = new SparkMD5.ArrayBuffer();
        const blobSlice = File.prototype.slice;
        const chunkSize = 2097152;
        const chunks = Math.ceil(chunk.size / chunkSize);
        const fileReader = new FileReader();
        let currentChunk = 0;
        fileReader.onload = function (e) {
            var _a;
            if (!((_a = e.target) === null || _a === void 0 ? void 0 : _a.result)) {
                return;
            }
            spark.append(e.target.result); // Append array buffer
            currentChunk++;
            if (currentChunk < chunks) {
                loadNext();
            }
            else {
                resolve(spark.end());
            }
        };
        fileReader.onerror = function (error) {
            reject(error);
        };
        function loadNext() {
            var start = currentChunk * chunkSize, end = start + chunkSize >= chunk.size ? chunk.size : start + chunkSize;
            fileReader.readAsArrayBuffer(blobSlice.call(chunk, start, end));
        }
        loadNext();
    });
};
