const { parentPort } = require("worker_threads");
const crypto = require("crypto");

// 接收主线程传递的 Buffer
parentPort.on("message", (buffer) => {
  const hash = crypto.createHash("md5");
  hash.update(buffer);
  const md5 = hash.digest("hex");
  parentPort.postMessage(md5);
});
