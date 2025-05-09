import { RequestChain } from ".";

class Wrapper {
  public static wrapperAxios(axios: any) {
    const request: RequestChain.RequestFn = (config) => {
      return axios.request({
        ...config,
        httpsAgent: config.agent,
        httpAgent: config.agent,
      });
    };
    return request;
  }
}

export default Wrapper;
