const path = require("path")
const { RequestChain, Wrapper } = require("./dist/cjs/core")
const { Downloader } = require("./dist/cjs/node")
const axios = require('axios')


const chain = new RequestChain({
    request: Wrapper.wrapperAxios(axios),
    timeout: 10000
})


const mian = async () => {


    const downloader = new Downloader({
        request: (config) => {
            return chain.request(config)
        },
        temp_path: path.join(__dirname, 'temps'),
        url: 'https://autopatchcn.juequling.com/package_download/op/client_app/download/20240802174850_VWL0aLFcPn4kKXjS/gwpc/ZenlessZoneZero_setup_202408021630.exe'
    })

    downloader.onProgress((data) => {
        console.log(data)
    })

    await downloader.download()
    await downloader.save(__dirname)
    await downloader.deleteDownloadTemp()

}


mian();
