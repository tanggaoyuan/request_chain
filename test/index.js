const { RequestChain, Wrapper } = require('../dist/cjs/core');
const { Downloader, LocalCache } = require('../dist/cjs/node')
const path = require("path")

const axios = require('axios');
const fs = require('fs');

const chain = new RequestChain({
    request: Wrapper.wrapperAxios(axios),
    local: new LocalCache(path.join(__dirname, 'http_chace.json'))
})


const main = async () => {

    const req1 = await chain.get("https://www.bilibili.com/").cache("local", 20000)

    console.log("req1", req1)

}

main();


