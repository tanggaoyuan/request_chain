import RequestChain, { RequestChainResponse } from "../core";

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

  private request: (config: RequestChain.Config) => RequestChainResponse<Blob>;
  private tasks: Array<{
    promise: Promise<Blob>;
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
            data: Blob;
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
              data: Blob;
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
    responseType: "blob",
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

  constructor(options: {
    url: string;
    /**
     * 保存的文件名称
     */
    name?: string;
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
    this.getFileInfo();
    this.getParts().then((parts) => {
      parts.forEach((__, index) => {
        this.status[index] = "pause";
      });
    });
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
              start,
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

  public async startPart(part: number, data: Record<string, any> = {}) {
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
    this.notifyStatus(part);

    const result = await this.getChache(part).catch(() => undefined);

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
        abort: () => {},
      };
      return promise;
    }

    const params = {
      ...this.config,
      params: {
        ...this.config.data,
        ...data,
      },
      headers: {
        ...this.config.headers,
        Range: `bytes=${part_info.start}-${part_info.end}`,
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
   * 通过part上传,该part将进入完成状态
   */
  public async skipPart(part: number, data: Blob) {
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
    const response = await Promise.allSettled(
      this.tasks.map((item) => {
        return item.promise;
      })
    );

    if (status.length === this.tasks.length && !isPause && !isPending) {
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
            data: Blob;
          }
        | {
            status: "stop";
            error: any;
          }
      >
    >;
  }

  /**
   * 开始上传
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

  private openDb = () => {
    return new Promise<IDBDatabase>((resolve, reject) => {
      const indexedDB = window.indexedDB;
      if (!indexedDB) {
        return Promise.reject(new Error("不支持DB"));
      }
      const request = indexedDB.open("DOWNLOAD_STORE");
      request.onsuccess = function (event: any) {
        resolve(event.target.result);
      };
      request.onerror = function (event) {
        reject(new Error("打开数据库失败"));
      };
      request.onupgradeneeded = function (event: any) {
        const db = event.target.result;
        db.createObjectStore("downloads", { keyPath: "id" });
      };
    });
  };

  private async setChache(part: number, chunk: Blob) {
    const db = await this.openDb();
    const file = await this.getFileInfo();
    const parts = await this.getParts();
    return new Promise((resolve, reject) => {
      const task = db
        .transaction(["downloads"], "readwrite")
        .objectStore("downloads")
        .add({
          ...parts[part],
          chunk,
          id: `${file.key}@@${part}`,
        });
      task.onsuccess = resolve;
      task.onerror = reject;
    });
  }

  private async getChache(part: number) {
    const db = await this.openDb();
    const file = await this.getFileInfo();
    const transaction = db.transaction(["downloads"]);
    const objectStore = transaction.objectStore("downloads");

    const request = objectStore.get(`${file.key}@@${part}`);

    return new Promise<DownloaderPart & { chunk: Blob }>((resolve, reject) => {
      request.onerror = function () {
        reject(request.error);
      };
      request.onsuccess = function () {
        resolve(request.result || false);
      };
    });
  }

  private async clearChache() {
    const db = await this.openDb();
    const file = await this.getFileInfo();
    const parts = await this.getParts();
    const table = db
      .transaction(["downloads"], "readwrite")
      .objectStore("downloads");
    parts.forEach((_, index) => {
      table.delete(`${file.key}@@${index}`);
    });
  }

  public async save(): Promise<boolean> {
    if (!this.status.every((value) => value === "done")) {
      return Promise.reject(new Error("文件未下载完成"));
    }
    const file = await this.getFileInfo();
    const response = await this.finishing();
    const blobs: Array<Blob> = [];
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
  }

  /**
   * 销毁实例 释放内存,清空indexDb缓存
   */
  public async destroyed() {
    this.clearChache();
    this.tasks = [];
    this.get_parts_promise = undefined;
    this.downloader = undefined;
    this.isDestroyed = true;
    this.events = new Map();
  }
}

export default Downloader;
