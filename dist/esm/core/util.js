export const isBrowser = () => {
    try {
        return typeof (window === null || window === void 0 ? void 0 : window.document) !== "undefined";
    }
    catch (error) {
        return false;
    }
};
