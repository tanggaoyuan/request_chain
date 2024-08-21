import { AxiosResponse } from "axios";
import RequestChain from "../core";
import Uploader, { UploaderParts } from "./uploader";
import Downloader from "./downloader";
declare class AxiosChain extends RequestChain<AxiosResponse> {
    constructor(config: Omit<RequestChain.BaseConfig, "request">, interceptor?: RequestChain.Interceptor<AxiosResponse>);
    upload<T = any>(parmas: {
        file: File;
        url: string;
        part_size?: number;
        concurrent?: number;
        /**
         * 只对upload方法有效
         * -1 禁用md5计算
         * n 大于等于n用线程计算md5 小于n主线程计算
         * Infinity 主线程计算
         */
        md5_thread?: number;
        checkpart?: (part: UploaderParts & {
            md5?: string;
        }) => Promise<T | void>;
    }): Uploader<T>;
    download(params: {
        url: string;
        part_size?: number;
        concurrent?: number;
        name?: string;
    }): Downloader;
}
export { Uploader, Downloader };
export default AxiosChain;
//# sourceMappingURL=axios.d.ts.map