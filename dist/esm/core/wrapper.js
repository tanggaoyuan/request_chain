class Wrapper {
    static wrapperAxios(axios) {
        const request = (config) => {
            return axios.request(Object.assign(Object.assign({}, config), { httpsAgent: config.agent, httpAgent: config.agent }));
        };
        return request;
    }
}
export default Wrapper;
