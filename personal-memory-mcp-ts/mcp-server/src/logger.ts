import pino from "pino";

const LOG_LEVEL = process.env.LOG_LEVEL || "info";

export const logger = pino({
  level: LOG_LEVEL,
  transport:
    process.env.NODE_ENV !== "production"
      ? { target: "pino/file", options: { destination: 2 } } // stderr
      : undefined,
  redact: {
    paths: ["req.headers.authorization", "token", "password"],
    censor: "[REDACTED]",
  },
  serializers: {
    err: pino.stdSerializers.err,
  },
});
