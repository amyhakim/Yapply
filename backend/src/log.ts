export type Level = "info" | "warn" | "error";
export type Logger = (level: Level, message: string, fields?: Record<string, unknown>) => void;

export const log: Logger = (level, message, fields = {}) => {
  const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...fields });
  (level === "error" ? console.error : console.log)(line);
};
