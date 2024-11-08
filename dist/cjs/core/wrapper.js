"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class Wrapper {
    static wrapperAxios(axios) {
        const request = (config) => {
            return axios.request(Object.assign(Object.assign({}, config), { httpsAgent: config.agent, httpAgent: config.agent }));
        };
        return request;
    }
}
exports.default = Wrapper;
