import { RequestChain, RequestChainResponse } from "../core";
import fs from "fs";
import { PassThrough } from "stream";
export interface DownloaderPart {
    start: number;
    end: number;
    total: number;
    name: string;
    part_name: string;
    part_index: number;
    part_size: number;
    part_count: number;
    temp_dir: string;
    temp_path: string;
}
declare class Downloader {
    private get_parts_promise?;
    private get_file_info_promise?;
    private request;
    private tasks;
    private part_size?;
    status: Array<"pending" | "wait" | "done" | "stop">;
    private downloader;
    private config;
    private events;
    private progress;
    temp_path: string;
    constructor(options: {
        url: string;
        /**
         * 缓存路劲
         */
        temp_path?: string;
        /**
         * 按大小切片
         */
        part_size?: number;
        /**
         * 调用一次 缓存结果
         */
        fetchFileInfo?: (config: RequestChain.Config) => Promise<{
            name: string;
            file_size: number;
            mine_type?: string;
            [x: string]: any;
        }>;
        request: (config: RequestChain.Config) => RequestChainResponse;
    });
    setConfig(config: Partial<RequestChain.Config>, mix?: boolean): this;
    getFileInfo(): Promise<{
        [x: string]: any;
        name: string;
        file_size: number;
        key: string;
        temp_dir: string;
        etag?: string;
        mine_type: string;
        headers: RequestChain.Response["headers"];
    }>;
    getParts(): Promise<DownloaderPart[]>;
    onProgress(fn: (file: {
        loaded: number;
        total: number;
        progress: number;
        name: string;
    }, parts: Array<{
        loaded: number;
        total: number;
        progress: number;
        name: string;
    }>) => void): () => void;
    private oldLoaded?;
    private notifyProgress;
    onStatus(fn: (status: Array<"pending" | "wait" | "done" | "stop">, part_index: number) => void): () => void;
    private notifyStatus;
    /**
     *
     * @param part
     * @param options
     * @returns
     */
    startPart(part: number, options?: {
        /**
         * 每次执行下载preloaded大小后停止，useCache=true时从缓存大小开始追加,useCache = false时从0开始
         */
        preloaded?: number;
        /**
         * 是否使用缓存
         */
        useCache?: boolean;
    }): Promise<PassThrough>;
    waitPartStream(stream: PassThrough): Promise<void>;
    waitPartDone(part: number): Promise<void>;
    /**
     * part 暂停当前切片任务,所有任务结束时，finish处于等待中
     */
    pausePart(part: number): void;
    /**
     * 停止当前任务，所有任务结束时，finish返回结果
     */
    stopPart(part: number): void;
    /**
     * 上传速度监听
     */
    private speedRef;
    private speedsize;
    onSpeed(fn: (speed: number, parts: Array<number>) => void): () => void;
    /**
     * 等待所有任务结束，返回状态
     */
    end(): Promise<("pending" | "done" | "stop" | "wait")[]>;
    /**
     * 等待所有任务结束，返回结果
     */
    finishing(): Promise<({
        status: "stop";
    } | {
        status: "done";
        stream: PassThrough;
    })[]>;
    /**
     * 开始下载
     */
    download(concurrent?: number): Promise<({
        status: "stop";
    } | {
        status: "done";
        stream: PassThrough;
    })[]>;
    /**
     *
     * @param save_path 可为文件夹 也可为具体文件
     * @returns
     */
    save(save_path: string): Promise<fs.WriteStream>;
    /**
     * 删除下载的缓存
     */
    deleteDownloadTemp(): Promise<unknown>;
}
export default Downloader;
//# sourceMappingURL=downloader.d.ts.map