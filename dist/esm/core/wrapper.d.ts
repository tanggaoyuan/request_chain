import { AxiosStatic } from "axios";
import { RequestChain } from ".";
declare class Wrapper {
    static wrapperAxios(axios: AxiosStatic): RequestChain.RequestFn;
}
export default Wrapper;
//# sourceMappingURL=wrapper.d.ts.map