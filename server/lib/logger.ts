// Console logging keeps the port dependency-free and is captured by Vercel logs.
export const logger = {
  info: (data: unknown, message?: string) => console.info(message, data),
  warn: (data: unknown, message?: string) => console.warn(message, data),
  error: (data: unknown, message?: string) => console.error(message, data),
};
