import { Cache, MemoryCache } from "../core/cache";
import fs from "fs";

export { Cache, MemoryCache };

export class LocalCache implements Cache {
  private readonly path: string;
  public store: Record<string, { expires?: number; data: any } | undefined> =
    {};

  constructor(path: string) {
    this.path = path;
    this.clearExpired();
  }

  public clearExpired() {
    try {
      const cache = this.read();
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
      this.write();
    } catch (error) {
      this.store = {};
    }
  }

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
    this.write();
  }

  public delete(key: string) {
    this.store[key] = undefined;
    this.write();
  }

  public read(): Record<string, { expires?: number; data: any } | undefined> {
    try {
      return JSON.parse(fs.readFileSync(this.path, "utf-8"));
    } catch (error) {
      return {};
    }
  }

  public write() {
    try {
      fs.writeFileSync(this.path, JSON.stringify(this.store), "utf-8");
      return true;
    } catch (error) {
      return false;
    }
  }
}
