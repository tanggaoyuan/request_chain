import { Worker } from "worker_threads";
import crypto from "crypto";
import path from "path";

export const getMd5Thread = (chunk: Buffer | string) => {
  return new Promise<string>((resolve, reject) => {
    const worker = new Worker(path.resolve(__dirname, "md5-worker.js"));
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

export const getMd5 = (chunk: Buffer | string) => {
  return new Promise<string>((resolve, reject) => {
    try {
      const hash = crypto.createHash("md5");
      hash.update(chunk);
      const md5 = hash.digest("hex");
      resolve(md5);
    } catch (error) {
      reject(error);
    }
  });
};
