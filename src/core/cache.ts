export abstract class Cache {
  public abstract get(key: string): any;
  public abstract set(key: string, data: any, expires?: number): any;
  public abstract delete(key: string): any;
}

export class MemoryCache implements Cache {
  public store: Record<string, { expires?: number; data: any } | undefined> =
    {};

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

  public set<T = any>(key: string, data: T, expires?: number) {
    this.store[key] = {
      data,
      expires: typeof expires === "number" ? Date.now() + expires : undefined,
    };
  }

  public delete(key: string) {
    if (this.store[key]) {
      this.store[key] = undefined;
    }
  }
}
