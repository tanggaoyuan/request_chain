import RequestChain, { RequestChainResponse } from "../core";
import fs from "fs";
import path from "path";

export interface DownloaderPart {
  start: number;
  end: number;
  total: number;
  name: string;
  part_name: string;
  part_index: number;
  part_size: number;
  part_count: number;
}

class Downloader {
  private get_parts_promise?: Promise<Array<DownloaderPart>>;

  private request: (config: RequestChain.Config) => RequestChainResponse<any>;
  private tasks: Array<{
    promise: Promise<Buffer>;
    abort: () => void;
  }> = [];

  private name?: string;
  private part_size?: number;
  private status: Array<"pending" | "pause" | "done" | "stop"> = [];
  private downloader?: {
    promise: Promise<
      Array<
        | {
            status: "done";
            data: Buffer;
          }
        | {
            status: "stop";
            error: any;
          }
      >
    >;
    callback: [
      (
        value: Array<
          | {
              status: "done";
              data: Buffer;
            }
          | {
              status: "stop";
              data: any;
            }
        >
      ) => void,
      (error: any) => void
    ];
  };

  private config: RequestChain.Config = {
    method: "GET",
    url: "",
    responseType: "stream",
  };

  private events: Map<string, Array<(...args: Array<any>) => void>> = new Map();
  private progress: Array<{
    loaded: number;
    total: number;
    progress: number;
    name: string;
  }> = [];
  private concurrent = 1;

  public isDestroyed = false;

  public dir_path: string;

  constructor(options: {
    url: string;
    /**
     * 保存的文件名称
     */
    name?: string;
    /**
     * 保存的文件夹路劲
     */
    dir_path: string;
    /**
     * 按大小切片
     */
    part_size?: number;
    concurrent?: number;
    request: (config: RequestChain.Config) => RequestChainResponse;
  }) {
    const callback: [any, any] = [null, null];
    this.downloader = {
      callback,
      promise: new Promise<any>((resolve, reject) => {
        callback[0] = resolve;
        callback[1] = reject;
      }),
    };
    this.concurrent = options.concurrent || 1;
    this.request = options.request;
    this.config.url = options.url;
    this.name = options.name;
    this.part_size = options.part_size;
    this.dir_path = options.dir_path;
    this.getFileInfo().then((response) => {
      const strs = response.name.split(".");
      strs.pop();
      const paths = [options.dir_path, strs.join("_")];
      const pathname = path.join(...paths);
      this.createDir(pathname);
    });
    this.getParts().then((parts) => {
      parts.forEach((__, index) => {
        this.status[index] = "pause";
      });
    });
  }

  public createDir(filePath: string) {
    const parts = filePath.split(path.sep);
    for (let i = 1; i <= parts.length; i++) {
      const currentPath = path.join(...parts.slice(0, i));
      if (!fs.existsSync(currentPath) && !path.extname(currentPath)) {
        fs.mkdirSync(currentPath);
      }
    }
  }

  public setConfig(config: Partial<RequestChain.Config>, mix = true) {
    this.config = mix
      ? {
          ...this.config,
          ...config,
        }
      : (config as RequestChain.Config);
    return this;
  }

  public async getFileInfo() {
    const response = await this.request({
      ...this.config,
      method: "HEAD",
      url: this.config.url,
      mergeSame: true,
      cache: "memory",
    });
    const total = Number(response.headers["content-length"]);
    const type = response.headers["content-type"];
    const lastModified = response.headers["last-modified"];
    const [url] = this.config.url.split("?");
    const originalName = url.split("/").pop() || "";
    const name = this.name || originalName;
    const key = `${originalName}@@${total}`;
    return { total, type, lastModified, originalName, name, key };
  }

  public async getParts() {
    if (!this.get_parts_promise) {
      const info = await this.getFileInfo();
      this.get_parts_promise = new Promise((resolve) => {
        const parts: Array<DownloaderPart> = [];
        if (this.part_size) {
          const part_count = Math.ceil(info.total / this.part_size);
          for (let i = 0; i < part_count; i++) {
            const start = i * this.part_size;
            const end = Math.min(info.total, (i + 1) * this.part_size);
            parts.push({
              part_count,
              part_index: i,
              part_name: `${info.name}.part${i + 1}`,
              start: start,
              end: end === info.total ? end : end - 1,
              total: info.total,
              name: info.originalName,
              part_size: end - start,
            });
          }
        } else {
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
  }

  public onProgress(
    fn: (
      file: { loaded: number; total: number; progress: number; name: string },
      parts: Array<{
        loaded: number;
        total: number;
        progress: number;
        name: string;
      }>
    ) => void
  ) {
    const events = this.events.get("ON_PROGRESS") || [];
    events.push(fn);
    this.events.set("ON_PROGRESS", events);
  }

  private async notifyProgress() {
    const events = this.events.get("ON_PROGRESS") || [];
    if (!events.length) {
      return;
    }
    let loaded = 0;
    this.progress.forEach((item) => {
      loaded += item.loaded;
    });
    const info = await this.getFileInfo();
    const params = {
      loaded,
      total: info.total,
      progress: Math.round((loaded / info.total) * 100),
    };
    events.forEach((fn) => {
      fn(params, this.progress);
    });
  }

  public onStatus(
    fn: (
      status: Array<"pending" | "pause" | "done" | "stop">,
      part_index: number
    ) => void
  ) {
    const events = this.events.get("ON_STATUS") || [];
    events.push(fn);
    this.events.set("ON_STATUS", events);
    this.notifyStatus(-1);
  }

  private notifyStatus(part: number) {
    const events = this.events.get("ON_STATUS") || [];
    if (!events.length) {
      return;
    }
    events.forEach((fn) => {
      fn(this.status, part);
    });
  }

  public async startPart(
    part: number,
    data: Record<string, any> = {}
  ): Promise<Buffer> {
    const parts = await this.getParts();
    const part_info = parts[part];

    if (["done", "pending", "stop"].includes(this.status[part])) {
      const task = this.tasks[part] || {
        promise: Promise.reject({ status: this.status[part], ...part_info }),
        abort: () => {},
      };
      this.tasks[part] = task;
      return task.promise;
    }

    this.status[part] = "pending";

    const strs = part_info.name.split(".");
    strs.pop();
    const dirname = strs.join("_");
    const dir_path = path.join(this.dir_path, dirname);
    const file_path = path.join(dir_path, part_info.part_name);

    const isExistFile = fs.existsSync(file_path);

    let start = part_info.start;

    const end = part_info.end;

    if (isExistFile) {
      const part_stat = fs.statSync(file_path);

      if (part_stat.size >= part_info.part_size) {
        const promise = new Promise<Buffer>((resolve, reject) => {
          fs.readFile(file_path, (err, data) => {
            if (err) {
              reject(err);
            } else {
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

    const writer = fs.createWriteStream(file_path, { flags: "a" });

    const params = {
      ...this.config,
      params: {
        ...this.config.data,
        ...data,
      },
      headers: {
        ...this.config.headers,
        Range: `bytes=${start}-${end}`,
      },
      onDownloadProgress: (value: any) => {
        this.progress[part] = {
          loaded: Math.round((value.progress || 0) * part_info.part_size),
          total: part_info.part_size,
          name: part_info.part_name,
          progress: Math.round((value.progress || 0) * 100),
        };
        this.notifyProgress();
      },
    };

    const task = this.request(params);

    const promise = new Promise<Buffer>((resolve, reject) => {
      let data: Array<Buffer> = [];
      task
        .then((response) => {
          response.data.pipe(writer);
          response.data.on("data", (chunk: Buffer) => {
            data.push(chunk);
          });
          response.data.on("end", () => {
            const buffer = Buffer.concat(data);
            data = [];
            resolve(buffer);
          });
          response.data.on("error", (error: any) => {
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
  }

  /**
   * part 暂停当前切片任务,所有任务结束时，upload处于等待中
   * 下载大小小于size时,终止请求
   */
  public pausePart(part: number, size = Infinity) {
    if (this.status[part] !== "pending") {
      return;
    }
    if (this.progress[part].loaded < size) {
      this.status[part] = "pause";
      this.tasks[part]?.abort();
      this.notifyStatus(part);
    }
  }

  /**
   * 停止当前任务，所有任务结束时，upload返回结果
   */
  public stopPart(part: number) {
    if (this.status[part] === "done") {
      return;
    }
    this.status[part] = "stop";
    this.tasks[part]?.abort();
    this.notifyStatus(part);
  }

  /**
   * 通过part下载,该part将进入完成状态
   */
  public async skipPart(part: number, data: Buffer) {
    const parts = await this.getParts();
    this.status[part] = "done";
    this.tasks[part] = {
      promise: Promise.resolve(data),
      abort: () => {},
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
  }

  /**
   * 上传速度监听
   */
  private speedRef = 0;
  private speedsize: Array<number> = [];
  public onSpeed(fn: (speed: number, parts: Array<number>) => void) {
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
        let parts: Array<number> = [];
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
  public async finishing() {
    const status = this.status.filter((value) => value);
    const isPause = status.some((value) => value === "pause");
    const isPending = status.some((value) => value === "pending");
    if (status.length === this.tasks.length && !isPause && !isPending) {
      const response = await Promise.allSettled(
        this.tasks.map((item) => item.promise)
      );
      const results: Array<{
        status: "stop" | "done";
        data: any;
        error: any;
      }> = [];
      response.forEach((item) => {
        if (item.status === "fulfilled") {
          results.push({
            status: "done",
            data: item.value,
            error: null,
          });
        } else {
          results.push({
            status: "stop",
            error: item.reason,
            data: null,
          });
        }
      });
      this.downloader?.callback[0](results);
    }
    return this.downloader?.promise as Promise<
      Array<
        | {
            status: "done";
            data: Buffer;
          }
        | {
            status: "stop";
            error: any;
          }
      >
    >;
  }

  /**
   * 开始下载
   */
  public async download() {
    const parts = await this.getParts();
    const promises = parts.map((_, index) => {
      return () => this.startPart(index);
    });

    const limitConcurrency = (
      promises: Array<() => Promise<any>>,
      limit: number
    ) => {
      let index = 0;
      const runNext = async (): Promise<void> => {
        if (index >= promises.length) {
          return;
        }
        const currentIndex = index++;
        try {
          await promises[currentIndex]();
        } catch (error) {
        } finally {
          await runNext();
        }
      };
      const tasks = Array.from(
        { length: Math.min(limit, promises.length) },
        () => runNext()
      );
      Promise.all(tasks);
    };

    limitConcurrency(promises, this.concurrent);

    return this.finishing();
  }

  public async save(save_path?: string): Promise<boolean> {
    if (!this.status.every((value) => value === "done")) {
      return Promise.reject(new Error("文件未下载完成"));
    }
    const file = await this.getFileInfo();
    const response = await this.finishing();
    const blobs: Array<Buffer> = [];
    for (const value of response) {
      if (value.status === "stop") {
        return Promise.reject(new Error("文件下载异常"));
      }
      blobs.push(value.data);
    }
    if (save_path) {
      return new Promise<boolean>((resolve, reject) => {
        const file_path = path.extname(save_path)
          ? save_path
          : path.join(save_path, file.name);
        fs.writeFile(file_path, Buffer.concat(blobs), (err: any) => {
          if (err) {
            reject(false);
          } else {
            resolve(true);
          }
        });
      });
    } else {
      return new Promise((resolve, reject) => {
        const file_path = path.join(this.dir_path, file.name);
        fs.writeFile(file_path, Buffer.concat(blobs), (err: any) => {
          if (err) {
            reject(false);
          } else {
            resolve(true);
          }
        });
      });
    }
  }

  /**
   * 删除下载的切片
   */
  public async deleteDownloadFile() {
    const file = await this.getFileInfo();
    const strs = file.name.split(".");
    strs.pop();
    const dirname = strs.join("_");
    const dir_path = path.join(this.dir_path, dirname);
    const isExist = fs.existsSync(dir_path);
    if (!isExist) {
      return true;
    }
    this.tasks = [];
    return new Promise((resolve, reject) => {
      fs.rm(dir_path, { force: true, recursive: true }, (err) => {
        if (err) {
          reject(false);
        } else {
          resolve(true);
        }
      });
    });
  }

  /**
   * 销毁实例 释放内存,清空下载缓存
   */
  public async destroyed() {
    this.deleteDownloadFile();
    this.tasks = [];
    this.get_parts_promise = undefined;
    this.downloader = undefined;
    this.isDestroyed = true;
    this.events = new Map();
  }
}

export default Downloader;
