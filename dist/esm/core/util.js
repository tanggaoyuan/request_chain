export const isBrowser = () => {
    return typeof (window === null || window === void 0 ? void 0 : window.document) !== 'undefined';
};
