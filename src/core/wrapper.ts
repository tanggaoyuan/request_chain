import { RequestChain } from ".";

class Wrapper {
  public static wrapperAxios(axios: any) {
    const request: RequestChain.RequestFn = (config) => {
      return axios.request(config);
    };
    return request;
  }
}

export default Wrapper;
