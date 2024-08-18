"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isBrowser = void 0;
const isBrowser = () => {
    return typeof (window === null || window === void 0 ? void 0 : window.document) !== 'undefined';
};
exports.isBrowser = isBrowser;
