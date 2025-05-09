## 链式调用 Api

一个请求工具的包装类能将其转为链式调用的形式，提供了常用的调用模式，支持 node 和 web

## 使用

- 安装

  ```bash
  npm i https://github.com/tanggaoyuan/request_chain
  ```

- web 导入

  ```ts
  import { RequestChain, Wrapper } from "request_chain/core";
  import { LocalCache, IndexDBCache } from "request_chain/browser";
  ```

- node 环境导入

  ```ts
  import { RequestChain, Wrapper } from "request_chain/core";
  import { LocalCache } from "request_chain/node";
  ```

- 创建

  ```ts
  import axios from "axios";

  const chain = new RequestChain(
    {
      // 使用包装器设置请求方法，可自行实现如fetch的包装
      request: Wrapper.wrapperAxios(axios),

      // 缓存类 浏览器有IndexDBCache，可基于Cache类实现缓存
      local: new LocalCache("store"),

      // 拦截器，设计为闭包形式，方便接口加密解密
      interceptor: async (config, chain) => {
        var token = await getToken();

        // 修改请求参数
        config.headers.token = token;
        config.responseType = "arraybuffer";

        // 或者
        chain.setHeaders({
          token: token,
        });
        chain.setConfig({
          responseType: "arraybuffer",
        });

        // 如果不return则按请求工具的结果返回

        // 异常抛出
        return Promise.reject("token失效");

        // 如果返回方法 则接口调用结束都会执行这个函数
        return async (response, error?: Error) => {
          // 如果方法不返回任何数据，则按默认行为处理

          // 抛异常
          return Promise.reject(error ?? "未知错误");

          // 修改结果 但不return
          response.data = JSON.parse(response.data);

          // 直接修改结果对象
          return {
            ...response.data,
            url: config.url,
          };

          // 重建请求,适合无感知刷新Token的情况
          const token = await updateToken();

          return chain.rebuild().setHeaders({
            token: token,
          });
        };
      },
    },
    {
      baseUrl: "http://localhost:2023",
      headers: {},
      // 是否默认开启，同一个请求并发执行时，合并请求
      mergeSame: true,
      // 失败的重试次数
      replay: 2,
      timeout: 30000, // 毫秒
    }
  );
  ```

- 合并请求 enableMergeSame

  ```ts
  // 并发执行10次，实际共用同一个promise，请求次数为一
  for (let i = 0; i < 10; i++) {
    await chain.post<any>("/api/xxxxxx").enableMergeSame();
  }

  // 前5次并发执行请求一次，后面请求5次
  for (let i = 0; i < 10; i++) {
    if (i < 5) {
      await chain
        .post<any>("/api/xxxxxx")
        .enableMergeSame()
        .send({ name: "chain" })
        .query({ q: 1 });
    } else {
      await chain
        .post<any>("/api/xxxxxx")
        .send({ name: "chain" })
        .query({ q: 1 });
    }
  }
  ```

- 接口缓存 cache

  ```ts
  // 设置持久性缓存,只对同一个请求设置cache的生效，如果有个一样的请求但没调用cache，则不会走缓存
  await chain
    .post<any>("/api/xxxxxx")
    .cache("local", Date.now() + 24 * 60 * 60000)
    .send({});

  // 设置内存缓存
  await chain
    .post<any>("/api/xxxxxx")
    .cache("memory", Date.now() + 24 * 60 * 60000)
    .send({});
  ```

- 请求重试

  ```ts
  await chain.post("/api/xxxxxx").replay(3);
  ```

- 取消请求

  ```ts
  const chain = chain.post("/api/xxxxxx");

  chain.then(
    (response) => {},
    (error) => {}
  );

  chain.abort("请求取消");
  ```

- 设置请求配置

  ```ts
  // multipart/form-data
  await chain.post("/api/xxxxxx").headerFromData();

  //application/x-www-form-urlencoded
  await chain.post("/api/xxxxxx").headerFormUrlencoded();

  // application/json
  await chain.post("/api/xxxxxx").headerJson();

  await chain
    .post("/api/xxxxxx")
    .cache("memory", Date.now() + 24 * 60 * 60000)
    .send({})
    .setConfig({ responseType: "arraybuffer" })
    .setHeaders({ token: "xxxxxx" });
  ```

- 取值

  ```ts
  var resonse = await chain.post("/api/xxxxxx");
  console.log(resonse.data);

  var data = await chain.post("/api/xxxxxx").getData();
  console.log(data);
  ```
