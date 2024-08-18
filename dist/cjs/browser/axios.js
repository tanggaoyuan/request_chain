"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Downloader = exports.Uploader = void 0;
const axios_1 = __importDefault(require("axios"));
const core_1 = __importDefault(require("../core"));
const uploader_1 = __importDefault(require("./uploader"));
exports.Uploader = uploader_1.default;
const downloader_1 = __importDefault(require("./downloader"));
exports.Downloader = downloader_1.default;
class AxiosChain extends core_1.default {
    constructor(config, interceptor) {
        super(Object.assign(Object.assign({}, config), { request: axios_1.default.request }), interceptor);
    }
    upload(parmas) {
        const uploader = new uploader_1.default(Object.assign(Object.assign({}, parmas), { request: this.request.bind(this) }));
        return uploader;
    }
    download(params) {
        const downloader = new downloader_1.default(Object.assign(Object.assign({}, params), { request: this.request.bind(this) }));
        return downloader;
    }
}
exports.default = AxiosChain;
