import SparkMD5 from "spark-md5";

class Md5Thread {
  private worker: Promise<Worker> | undefined;

  constructor() {
    this.open();
  }

  private async open() {
    if (!this.worker) {
      this.worker = this.createWorker((window) => {
        const { SparkMD5 } = window;
        window.onmessage = async (event) => {
          try {
            const { chunk } = event.data;
            const spark = new SparkMD5.ArrayBuffer();

            const blobSlice = File.prototype.slice;

            const chunkSize = 2097152;
            const chunks = Math.ceil(chunk.size / chunkSize);
            const fileReader = new FileReader();

            let currentChunk = 0;

            fileReader.onload = function (e) {
              if (!e.target?.result) {
                return;
              }
              spark.append(e.target.result); // Append array buffer
              currentChunk++;
              if (currentChunk < chunks) {
                loadNext();
              } else {
                window.postMessage({
                  type: "done",
                  data: spark.end(),
                });
              }
            };

            fileReader.onerror = function (error) {
              window.postMessage({ type: "error", error });
            };

            function loadNext() {
              var start = currentChunk * chunkSize,
                end =
                  start + chunkSize >= chunk.size
                    ? chunk.size
                    : start + chunkSize;
              fileReader.readAsArrayBuffer(blobSlice.call(chunk, start, end));
            }

            loadNext();
          } catch (error) {
            window.postMessage({ type: "error", error });
          }
        };
      });
    }
    return this.worker;
  }

  public async generateMd5(chunk: Blob) {
    const worker = await this.open();
    worker.postMessage({
      chunk,
    });
    return new Promise<string>((resolve, reject) => {
      worker.onmessage = (res) => {
        const { data, error } = res.data;
        if (error) {
          reject(error);
          worker.terminate();
        }
        if (data) {
          resolve(data);
          worker.terminate();
        }
      };
    });
  }

  private async createWorker(
    handler: (window: Worker & { [x: string]: any }) => void
  ) {
    //@ts-ignore
    const module = await import(`spark-md5?raw`);
    const blob = new Blob([`${module.default} (${handler.toString()})(self)`]);
    const url = window.URL.createObjectURL(blob);
    const worker = new Worker(url);
    return worker;
  }
}

export const getMd5Thread = async (chunk: Blob) => {
  return new Md5Thread().generateMd5(chunk);
};

export const getMd5 = (chunk: Blob) => {
  return new Promise<string>((resolve, reject) => {
    const spark = new SparkMD5.ArrayBuffer();

    const blobSlice = File.prototype.slice;

    const chunkSize = 2097152;
    const chunks = Math.ceil(chunk.size / chunkSize);
    const fileReader = new FileReader();

    let currentChunk = 0;

    fileReader.onload = function (e) {
      if (!e.target?.result) {
        return;
      }
      spark.append(e.target.result as ArrayBuffer); // Append array buffer
      currentChunk++;
      if (currentChunk < chunks) {
        loadNext();
      } else {
        resolve(spark.end());
      }
    };

    fileReader.onerror = function (error) {
      reject(error);
    };

    function loadNext() {
      var start = currentChunk * chunkSize,
        end = start + chunkSize >= chunk.size ? chunk.size : start + chunkSize;
      fileReader.readAsArrayBuffer(blobSlice.call(chunk, start, end));
    }

    loadNext();
  });
};
