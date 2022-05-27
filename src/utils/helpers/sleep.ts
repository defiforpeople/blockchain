export const second = 1000;
export const minute = 60 * second;
export const hour = 60 * minute;
export const day = 24 * hour;

export const sleep = async (time: number) => {
  return new Promise((resolve: any) => {
    setTimeout(() => {
      resolve();
    }, time);
  });
};
