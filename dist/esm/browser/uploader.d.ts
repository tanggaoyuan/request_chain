import RequestChain, { RequestChainResponse } from "../core";
export interface UploaderParts {
    name: string;
    total: number;
    lastModified: number;
    chunk: Blob;
    part_name: string;
    part_index: number;
    part_size: number;
    part_count: number;
}
declare class Uploader<T = any> {
    private parts;
    private tasks;
    private request;
    private config;
    private name;
    private status;
    private uploader?;
    private file;
    private events;
    private md5s;
    isDestroyed: boolean;
    private progress;
    private concurrent;
    private md5_thread;
    private checkpart?;
    constructor(options: {
        file: File;
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
        checkpart?: (part: UploaderParts & {
            md5?: string;
        }) => Promise<T | void>;
        part_size?: number;
        /**
         * 并发上传的个数
         */
        concurrent?: number;
    });
    setConfig(config: RequestChain.Config, mix?: boolean): this;
    getParts(): UploaderParts[];
    getPart(index: number): UploaderParts;
    /**
     * 计算过的part将会被缓存
     * @param part 获取part的 -1 获取整个文件的md5
     * @param thread 是否启用线程计算
     */
    getMd5(part: number, thread: boolean): Promise<string>;
    /**
     * part 暂停当前切片任务,所有任务结束时，upload处于等待中
     * 下载大小小于size时,终止请求
     */
    pausePart(part: number, size?: number): void;
    /**
     * 停止当前任务，所有任务结束时，upload返回结果
     */
    stopPart(part: number): void;
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
    startPart(part: number, data?: {
        md5?: string;
        [x: string]: any;
    }): Promise<T>;
    /**
     * 通过part上传,该part将进入完成状态
     */
    skipPart(part: number, data: T): Promise<T>;
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
        data: T;
    } | {
        status: "stop";
        error: any;
    })[]>;
    /**
     * 开始上传
     */
    upload(): Promise<({
        status: "done";
        data: T;
    } | {
        status: "stop";
        error: any;
    })[]>;
    /**
     * 销毁实例 释放内存
     */
    destroyed(): Promise<void>;
}
export default Uploader;
//# sourceMappingURL=uploader.d.ts.map