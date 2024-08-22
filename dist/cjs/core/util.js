"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isBrowser = void 0;
const isBrowser = () => {
    try {
        return typeof (window === null || window === void 0 ? void 0 : window.document) !== "undefined";
    }
    catch (error) {
        return false;
    }
};
exports.isBrowser = isBrowser;
