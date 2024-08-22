import { isBrowser } from "./util";
import fs from "fs";

export abstract class Cache {
  public store: Record<string, { expires?: number; data: any } | undefined> =
    {};

  public async init() {
    try {
      const cache = await this.read();
      Object.keys(cache).forEach((key) => {
        const value = cache[key];
        if (!value) {
          return;
        }
        if (typeof value.expires === "number" && value.expires < Date.now()) {
          cache[key] = undefined;
        }
      });
      this.store = cache ?? {};
    } catch (error) {
      this.store = {};
    }
  }

  public abstract read(): Promise<
    Record<string, { expires?: number; data: any } | undefined>
  >;

  public abstract write(
    data: Record<string, { expires?: number; data: any } | undefined>
  ): Promise<boolean>;

  public get<T = any>(key: string) {
    const value = this.store[key];
    if (!value) {
      return null;
    }
    if (typeof value.expires === "number" && value.expires < Date.now()) {
      this.delete(key);
      return null;
    }
    return value.data as T;
  }

  public set(key: string, data: any, expires?: number) {
    this.store[key] = {
      data,
      expires: typeof expires === "number" ? Date.now() + expires : undefined,
    };
    this.write(this.store);
  }

  public delete(key: string) {
    if (this.store[key]) {
      this.store[key] = undefined;
      this.write(this.store);
    }
  }
}

export class MemoryCache extends Cache {
  constructor() {
    super();
    this.init();
  }
  public read(): Promise<
    Record<string, { expires?: number; data: any } | undefined>
  > {
    return Promise.resolve({});
  }
  public write(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

export class LocalCache extends Cache {
  private readonly path: string;

  constructor(path: string) {
    super();
    this.path = path;
    this.init();
  }

  public async read(): Promise<
    Record<string, { expires?: number; data: any } | undefined>
  > {
    try {
      if (isBrowser()) {
        return JSON.parse(window.localStorage.getItem(this.path) || "{}");
      } else {
        return JSON.parse(fs.readFileSync(this.path, "utf-8"));
      }
    } catch (error) {
      return {};
    }
  }

  public async write(
    data: Record<string, { expires?: number; data: any } | undefined>
  ) {
    try {
      if (isBrowser()) {
        window.localStorage.setItem(this.path, JSON.stringify(data));
      } else {
        fs.writeFileSync(this.path, JSON.stringify(data), "utf-8");
      }
      return true;
    } catch (error) {
      return false;
    }
  }
}
