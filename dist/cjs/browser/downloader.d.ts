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
    private request;
    private tasks;
    private name?;
    private part_size?;
    private status;
    private downloader?;
    private config;
    private events;
    private progress;
    private concurrent;
    isDestroyed: boolean;
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
    });
    setConfig(config: Partial<RequestChain.Config>, mix?: boolean): this;
    getFileInfo(): Promise<{
        total: number;
        type: any;
        lastModified: any;
        originalName: string;
        name: string;
        key: string;
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
    startPart(part: number, data?: Record<string, any>): Promise<any>;
    /**
     * part 暂停当前切片任务,所有任务结束时，upload处于等待中
     * 下载大小小于size时,终止请求
     */
    pausePart(part: number, size?: number): void;
    /**
     * 停止当前任务，所有任务结束时，upload返回结果
     */
    stopPart(part: number): void;
    /**
     * 通过part上传,该part将进入完成状态
     */
    skipPart(part: number, data: Blob): Promise<Blob>;
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
        data: Blob;
    } | {
        status: "stop";
        error: any;
    })[]>;
    /**
     * 开始上传
     */
    download(): Promise<({
        status: "done";
        data: Blob;
    } | {
        status: "stop";
        error: any;
    })[]>;
    private setChache;
    private getChache;
    private clearChache;
    save(): Promise<boolean>;
    /**
     * 销毁实例 释放内存,清空indexDb缓存
     */
    destroyed(): Promise<void>;
}
export default Downloader;
//# sourceMappingURL=downloader.d.ts.map