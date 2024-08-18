import axios, { AxiosResponse } from "axios";
import RequestChain from "../core";
import Uploader, { UploaderParts } from "./uploader";
import Downloader from "./downloader";

class AxiosChain extends RequestChain<AxiosResponse> {
  constructor(
    config: Omit<RequestChain.BaseConfig, "request">,
    interceptor?: RequestChain.Interceptor<AxiosResponse>
  ) {
    super(
      {
        ...config,
        request: axios.request,
      },
      interceptor
    );
  }

  public upload<T = any>(parmas: {
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
    checkpart?: (part: UploaderParts & { md5?: string }) => Promise<T | void>;
  }) {
    const uploader = new Uploader<T>({
      ...parmas,
      request: this.request.bind(this),
    });
    return uploader;
  }

  public download(params: { url: string; part_size?: number }) {
    const downloader = new Downloader({
      ...params,
      request: this.request.bind(this),
    });
    return downloader;
  }
}

export { Uploader, Downloader };

export default AxiosChain;
