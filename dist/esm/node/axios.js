import axios from "axios";
import RequestChain from "../core";
import Uploader from "./uploader";
import Downloader from "./downloader";
class AxiosChain extends RequestChain {
    constructor(config, interceptor) {
        super(Object.assign(Object.assign({}, config), { request: (params) => {
                return axios.request(Object.assign(params, config.agent
                    ? { httpAgent: config.agent, httpsAgent: config.agent }
                    : {}));
            } }), interceptor);
    }
    upload(parmas) {
        const uploader = new Uploader(Object.assign(Object.assign({}, parmas), { request: this.request.bind(this) }));
        return uploader;
    }
    download(params) {
        const downloader = new Downloader(Object.assign(Object.assign({}, params), { request: this.request.bind(this) }));
        return downloader;
    }
}
export { Uploader, Downloader };
export default AxiosChain;
