
const disposition = require("content-disposition")


const value = "attachment; filename*=UTF-8''3.mp4"


console.log(disposition.parse(value))