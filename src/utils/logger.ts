const prefix = "[sportx360]";

export default {
  info: (msg: string, meta?: Record<string, unknown>) => {
    if (meta) console.log(prefix, msg, meta);
    else console.log(prefix, msg);
  },
  warn: (msg: string, meta?: Record<string, unknown>) => {
    if (meta) console.warn(prefix, msg, meta);
    else console.warn(prefix, msg);
  },
  error: (msg: string, meta?: Record<string, unknown>) => {
    if (meta) console.error(prefix, msg, meta);
    else console.error(prefix, msg);
  },
  debug: (msg: string, meta?: Record<string, unknown>) => {
    if (process.env.NODE_ENV === "development") {
      if (meta) console.debug(prefix, msg, meta);
      else console.debug(prefix, msg);
    }
  },
};
