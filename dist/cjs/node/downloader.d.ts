import { RequestChain, RequestChainResponse } from "../core";
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
declare class Downloader {
    private get_parts_promise?;
    private get_file_info_promise?;
    private request;
    private tasks;
    private part_size?;
    private status;
    private downloader;
    private config;
    private events;
    private progress;
    private concurrent;
    isDestroyed: boolean;
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
        concurrent?: number;
        /**
         * 调用一次 缓存结果
         */
        fetchFileInfo?: (config: RequestChain.Config) => Promise<{
            name: string;
            file_size: number;
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
        headers: Record<string, string>;
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
    }>) => void): void;
    private notifyProgress;
    onStatus(fn: (status: Array<"pending" | "pause" | "done" | "stop">, part_index: number) => void): void;
    private notifyStatus;
    startPart(part: number, data?: Record<string, any>): Promise<Buffer>;
    /**
     * part 暂停当前切片任务,所有任务结束时，upload处于等待中
     * 下载大小小于size时,终止请求
     */
    pausePart(part: number, size?: number): Promise<never>;
    /**
     * 停止当前任务，所有任务结束时，upload返回结果
     */
    stopPart(part: number): Promise<never>;
    /**
     * 通过part下载,该part将进入完成状态
     */
    skipPart(part: number, data: Buffer): Promise<Buffer>;
    /**
     * 上传速度监听
     */
    private speedRef;
    private speedsize;
    onSpeed(fn: (speed: number, parts: Array<number>) => void): void;
    /**
     * 等待所有任务结束，返回结果
     */
    finishing(): Promise<({
        status: "done";
        data: Buffer;
    } | {
        status: "stop";
        error: any;
    })[]>;
    /**
     * 开始下载
     */
    download(): Promise<({
        status: "done";
        data: Buffer;
    } | {
        status: "stop";
        error: any;
    })[]>;
    /**
     *
     * @param save_path 可为文件夹 也可为具体文件
     * @returns
     */
    save(save_path: string): Promise<boolean>;
    /**
     * 删除下载的缓存
     */
    deleteDownloadTemp(): Promise<unknown>;
    /**
     * 销毁实例 释放内存,清空下载缓存
     */
    destroyed(): Promise<void>;
}
export default Downloader;
//# sourceMappingURL=downloader.d.ts.map