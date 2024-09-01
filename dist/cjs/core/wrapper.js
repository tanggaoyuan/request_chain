"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class Wrapper {
    static wrapperAxios(axios) {
        const request = (config) => {
            return axios.request(config);
        };
        return request;
    }
}
exports.default = Wrapper;
