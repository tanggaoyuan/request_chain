class Wrapper {
    static wrapperAxios(axios) {
        const request = (config) => {
            return axios.request(config);
        };
        return request;
    }
}
export default Wrapper;
