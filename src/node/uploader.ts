import RequestChain, { RequestChainResponse } from "../core";
import { getMd5, getMd5Thread } from "./md5";
import fs from "fs";
import path from "path";

export interface UploaderParts {
  name: string;
  total: number;
  lastModified: number;
  part_name: string;
  part_index: number;
  part_size: number;
  part_count: number;
  start: number;
  end: number;
}

class Uploader<T = any> {
  private parts: Array<UploaderParts> = [];

  private tasks: Array<{
    promise: Promise<T>;
    abort: () => void;
  }> = [];

  private request: <T>(config: RequestChain.Config) => RequestChainResponse<T>;

  private config: RequestChain.Config = {
    method: "POST",
    url: "",
    headers: { "Content-Type": "multipart/form-data" },
  };
  private name: string;
  private status: Array<"pending" | "pause" | "done" | "stop"> = [];
  private uploader?: {
    promise: Promise<
      Array<
        | {
            status: "done";
            data: T;
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
              data: T;
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
  private file: {
    size: number;
    name: string;
    lastModified: number;
    path: string;
  };
  private events: Map<string, Array<(...args: Array<any>) => void>> = new Map();
  private md5s: Map<number, string> = new Map();
  public isDestroyed = false;

  private progress: Array<{
    loaded: number;
    total: number;
    progress: number;
    name: string;
  }> = [];

  private concurrent = 1;
  private md5_thread = -1;
  private checkpart?: (
    part: UploaderParts & { md5?: string }
  ) => Promise<T | void>;

  constructor(options: {
    file_path: string;
    url: string;
    name?: string;
    request: <T>(config: RequestChain.Config) => RequestChainResponse<T>;
    /**
     * 只对upload方法有效
     * -1 禁用md5计算
     * n 大于等于n用线程计算md5 小于n主线程计算
     * Infinity 主线程计算
     */
    md5_thread?: number;
    /**
     * 只对upload方法有效
     * 检查模块是否上传
     * 返回T则跳过该part上传
     */
    checkpart?: (part: UploaderParts & { md5?: string }) => Promise<T | void>;
    part_size?: number;
    /**
     * 并发上传的个数
     */
    concurrent?: number;
    /**
     * 名称、修改时间、大小 为key 缓存上传结果
     */
    // enableCache?: boolean;
  }) {
    const callback: [any, any] = [null, null];
    this.uploader = {
      callback,
      promise: new Promise<any>((resolve, reject) => {
        callback[0] = resolve;
        callback[1] = reject;
      }),
    };

    const stat = fs.statSync(options.file_path);

    const name = path.basename(options.file_path);

    const file = {
      size: stat.size,
      name,
      lastModified: stat.mtimeMs,
      path: options.file_path,
    };

    this.file = file;

    const {
      request,
      part_size = 0,
      url,
      concurrent = 1,
      md5_thread = -1,
      checkpart,
    } = options;

    this.concurrent = concurrent;
    this.md5_thread = md5_thread;

    this.name = options.name || "file";

    this.request = request;
    this.checkpart = checkpart;
    this.config.url = url;

    let part_count = 1;
    if (part_size) {
      part_count = Math.ceil(file.size / part_size);
    }

    for (let i = 0; i < part_count; i++) {
      const start = i * part_size;
      const end = Math.min(file.size, (i + 1) * part_size);
      const part = {
        name: file.name,
        total: file.size,
        lastModified: file.lastModified,
        part_name: `${file.name}.part${i + 1}`,
        part_index: i,
        part_size: end - start,
        start,
        end,
        part_count,
      };
      this.parts.push(part);
      this.progress.push({
        progress: 0,
        total: end - start,
        loaded: 0,
        name: part.part_name,
      });
      this.status.push("pause");
    }
  }

  public setConfig(config: RequestChain.Config, mix = true) {
    this.config = mix
      ? {
          ...this.config,
          ...config,
        }
      : config;
    return this;
  }

  public getParts() {
    return this.parts;
  }

  public getPart(index: number) {
    return this.parts[index];
  }

  public readFileRange(start: number, end: number) {
    try {
      const readStream = fs.createReadStream(this.file.path, { start, end });
      const chunks: Array<Buffer> = [];
      return new Promise<Buffer>((resolve, reject) => {
        readStream.on("data", (chunk) => {
          chunks.push(chunk as Buffer);
        });
        readStream.on("end", () => {
          const buffer = Buffer.concat(chunks);
          resolve(buffer);
        });
        readStream.on("error", (err) => {
          reject(err);
        });
      });
    } catch (err) {
      return Promise.reject(err);
    }
  }

  /**
   * 计算过的part将会被缓存
   * @param part 获取part的 -1 获取整个文件的md5
   * @param thread 是否启用线程计算
   */
  public async getMd5(part: number, thread: boolean): Promise<string> {
    if (this.md5s.get(part)) {
      return this.md5s.get(part) as string;
    }
    const { start, end } = this.parts[part];
    const buffer = await this.readFileRange(start, end);
    return thread ? getMd5Thread(buffer) : getMd5(buffer);
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

  private notifyProgress() {
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
    data: { md5?: string; [x: string]: any } = {}
  ) {
    const part_info = this.getPart(part);
    if (["done", "pending", "stop"].includes(this.status[part])) {
      const task = this.tasks[part] || {
        promise: Promise.reject({ status: this.status[part], ...part_info }),
        abort: () => {},
      };
      this.tasks[part] = task;
      return task.promise;
    }

    this.status[part] = "pending";

    const chunk = fs.createReadStream(this.file.path, {
      start: part_info.start,
      end: part_info.end,
    });

    const task = this.request<T>({
      ...this.config,
      data: {
        ...part_info,
        ...this.config.data,
        ...data,
        [this.name]: chunk,
      },
      onUploadProgress: (value) => {
        this.progress[part] = {
          loaded: Math.round((value.progress || 0) * part_info.part_size),
          total: part_info.part_size,
          name: part_info.part_name,
          progress: Math.round((value.progress || 0) * 100),
        };
        this.notifyProgress();
      },
    });
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
  public skipPart(part: number, data: T) {
    this.status[part] = "done";
    this.tasks[part] = {
      promise: Promise.resolve(data),
      abort: () => {},
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
    const response = await Promise.allSettled(
      this.tasks.map((item) => {
        return item.promise;
      })
    );
    if (status.length === this.parts.length && !isPause && !isPending) {
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
      this.uploader?.callback[0](results);
    }
    const promoise = this.uploader?.promise;
    return promoise as Promise<
      Array<{ status: "done"; data: T } | { status: "stop"; error: any }>
    >;
  }

  /**
   * 开始上传
   */
  public upload() {
    const promises = this.parts.map((item, index) => {
      return async () => {
        const part = this.parts[index];
        let md5: string | undefined = undefined;
        if (this.md5_thread === -1) {
          md5 = undefined;
        } else {
          md5 = await this.getMd5(index, part.part_size >= this.md5_thread);
        }

        if (this.checkpart) {
          const result = await this.checkpart({
            md5,
            ...part,
          });
          if (result) {
            return this.skipPart(index, result);
          } else {
            return this.startPart(index, { md5 });
          }
        }

        return this.startPart(index, { md5 });
      };
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

  /**
   * 销毁实例 释放内存
   */
  public async destroyed() {
    this.tasks = [];
    this.parts = [];
    this.uploader = undefined;
    this.isDestroyed = true;
    this.events = new Map();
  }
}

export default Uploader;
