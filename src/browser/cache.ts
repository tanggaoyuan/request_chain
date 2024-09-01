import { MemoryCache, Cache } from "../core/cache";

export { MemoryCache, Cache };

export class LocalCache implements Cache {
  private readonly id: string;

  constructor(key: string) {
    this.id = key;
    this.clearExpired();
  }

  public async clearExpired() {
    for (let i = 0; i < localStorage.length; i++) {
      try {
        const key = localStorage.key(i);
        if (key.startsWith(this.id)) {
          const value = JSON.parse(localStorage.getItem(key));
          if (typeof value.expires === "number" && value.expires < Date.now()) {
            this.delete(key);
          }
        }
      } catch (error) {
        //
      }
    }
  }

  public get(key: string) {
    try {
      const value = JSON.parse(localStorage.getItem(`${this.id}_${key}`));
      if (typeof value.expires === "number" && value.expires < Date.now()) {
        this.delete(key);
        return null;
      }
      return value.data;
    } catch (error) {
      return null;
    }
  }

  public set(key: string, data: any, expires?: number) {
    localStorage.setItem(
      `${this.id}_${key}`,
      JSON.stringify({
        data,
        expires: typeof expires === "number" ? Date.now() + expires : undefined,
      })
    );
  }

  public delete(key: string) {
    localStorage.removeItem(key);
  }
}

export class IndexDBCache implements Cache {
  private readonly key: string;
  public store: Record<string, { expires?: number; data: any }>;

  constructor(key: string) {
    this.key = key;
    this.clearExpired();
  }

  private openDb = (version?: number) => {
    return new Promise<IDBDatabase>((resolve, reject) => {
      const indexedDB = window.indexedDB;
      if (!indexedDB) {
        return Promise.reject(new Error("不支持DB"));
      }
      const request = indexedDB.open("REQUEST_CHAIN", version);
      request.onsuccess = (event: any) => {
        const db = event.target.result;
        if (db.objectStoreNames.contains(this.key)) {
          resolve(db);
        } else {
          this.openDb(db.version + 1).then(resolve, reject);
        }
      };
      request.onerror = function (event) {
        reject(new Error("打开数据库失败"));
      };
      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;
        db.createObjectStore(this.key, { keyPath: "id" });
      };
    });
  };

  public async clearExpired() {
    const db = await this.openDb();
    const transaction = db.transaction([this.key], "readonly");
    const objectStore = transaction.objectStore(this.key);
    const request = objectStore.getAll();
    request.onsuccess = () => {
      request.result.forEach((item) => {
        const { expires, id } = item;
        if (typeof expires === "number" && expires < Date.now()) {
          this.delete(id);
        }
      });
    };
  }

  public async getAll() {
    const db = await this.openDb();
    const transaction = db.transaction([this.key], "readonly");
    const objectStore = transaction.objectStore(this.key);
    const request = objectStore.getAll();
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = reject;
    });
  }

  async get<T = any>(key: string) {
    const db = await this.openDb();
    const transaction = db.transaction([this.key], "readonly");
    const objectStore = transaction.objectStore(this.key);
    const request = objectStore.get(key);
    return new Promise<T>((resolve, reject) => {
      request.onsuccess = () => {
        const { data, expires, id } = request.result;
        if (typeof expires === "number" && expires < Date.now()) {
          this.delete(id);
          resolve(null);
        } else {
          resolve(data);
        }
      };
      request.onerror = reject;
    });
  }

  async set<T = any>(key: string, data: T, expires?: number) {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const task = db
        .transaction([this.key], "readwrite")
        .objectStore(this.key)
        .add({
          data,
          expires:
            typeof expires === "number" ? Date.now() + expires : undefined,
          id: key,
        });
      task.onsuccess = () => resolve(true);
      task.onerror = () => reject(false);
    });
  }

  async delete(key: string) {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.key], "readwrite");
      const objectStore = transaction.objectStore(this.key);
      const task = objectStore.delete(key);
      task.onsuccess = () => resolve(true);
      task.onerror = () => reject(false);
    });
  }
}
