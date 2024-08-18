export const isBrowser = () => {
    return typeof window?.document !== 'undefined';
};
