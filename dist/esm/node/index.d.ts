import { Cache, MemoryCache, LocalCache } from "./cache";
import Downloader from "./downloader";
import Uploader from "./uploader";
declare const MD5: {
    getMd5Thread: (chunk: Buffer) => Promise<string>;
    getMd5: (chunk: Buffer) => Promise<string>;
};
export { Cache, MemoryCache, LocalCache, Downloader, MD5, Uploader };
//# sourceMappingURL=index.d.ts.map