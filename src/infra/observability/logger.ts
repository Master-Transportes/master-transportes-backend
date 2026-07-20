type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  component?: string;
  [key: string]: unknown;
}

class Logger {
  debug(message: string, context?: LogContext): void {
    this.write("debug", message, context);
  }

  info(message: string, context?: LogContext): void {
    this.write("info", message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.write("warn", message, context);
  }

  error(message: string, error?: unknown, context?: LogContext): void {
    this.write("error", message, {
      ...context,
      error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error,
    });
  }

  private write(level: LogLevel, message: string, context?: LogContext): void {
    const payload = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...context,
    };

    const line = JSON.stringify(payload);
    if (level === "error") {
      console.error(line);
      return;
    }

    if (level === "warn") {
      console.warn(line);
      return;
    }

    console.log(line);
  }
}

export const logger = new Logger();
