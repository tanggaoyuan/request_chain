export const isBrowser = () => {
  try {
    return typeof window?.document !== "undefined";
  } catch (error) {
    return false;
  }
};
