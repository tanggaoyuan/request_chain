"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMd5 = exports.getMd5Thread = void 0;
const worker_threads_1 = require("worker_threads");
const crypto_1 = __importDefault(require("crypto"));
const path_1 = __importDefault(require("path"));
const getMd5Thread = (chunk) => {
    return new Promise((resolve, reject) => {
        const worker = new worker_threads_1.Worker(path_1.default.resolve(__dirname, "md5-worker.js"));
        worker.postMessage(chunk);
        worker.on("message", (md5) => {
            resolve(md5);
            worker.terminate(); // 计算完成后关闭 Worker
        });
        worker.on("error", (err) => {
            reject(err);
            worker.terminate(); // 出现错误时关闭 Worker
        });
        worker.on("exit", (code) => {
            if (code !== 0) {
                reject(new Error(`Worker stopped with exit code ${code}`));
            }
        });
    });
};
exports.getMd5Thread = getMd5Thread;
const getMd5 = (chunk) => {
    return new Promise((resolve, reject) => {
        try {
            const hash = crypto_1.default.createHash("md5");
            hash.update(chunk);
            const md5 = hash.digest("hex");
            resolve(md5);
        }
        catch (error) {
            reject(error);
        }
    });
};
exports.getMd5 = getMd5;
