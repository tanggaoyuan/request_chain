import { AxiosStatic } from "axios";
import { RequestChain } from ".";

class Wrapper {
  public static wrapperAxios(axios: AxiosStatic) {
    const request: RequestChain.RequestFn = (config) => {
      return axios.request(config);
    };
    return request;
  }
}

export default Wrapper;
