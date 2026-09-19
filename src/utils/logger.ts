export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  context: string;
  message: string;
  data?: unknown;
}

class Logger {
  private inMemoryLogs: LogEntry[] = [];
  private maxLogs: number = 200;

  private normalizeData(data?: unknown): unknown {
    if (data instanceof Error) {
      return {
        name: data.name,
        message: data.message,
        stack: data.stack,
      };
    }
    return data;
  }

  private createEntry(level: LogLevel, context: string, message: string, data?: unknown): LogEntry {
    const entry: LogEntry = {
      id: Math.random().toString(36).slice(2, 9),
      timestamp: new Date().toISOString(),
      level,
      context,
      message,
      data: this.normalizeData(data),
    };

    this.inMemoryLogs.push(entry);
    if (this.inMemoryLogs.length > this.maxLogs) {
      this.inMemoryLogs.shift();
    }

    return entry;
  }

  public debug(context: string, message: string, data?: unknown) {
    const entry = this.createEntry('DEBUG', context, message, data);
    if (import.meta.env.DEV) {
      console.debug(`[${entry.timestamp}] [DEBUG] [${context}]`, message, data ?? '');
    }
  }

  public info(context: string, message: string, data?: unknown) {
    const entry = this.createEntry('INFO', context, message, data);
    console.info(`[${entry.timestamp}] [INFO] [${context}]`, message, data ?? '');
  }

  public warn(context: string, message: string, data?: unknown) {
    const entry = this.createEntry('WARN', context, message, data);
    console.warn(`[${entry.timestamp}] [WARN] [${context}]`, message, data ?? '');
  }

  public error(context: string, message: string, error?: unknown) {
    const entry = this.createEntry('ERROR', context, message, error);
    console.error(`[${entry.timestamp}] [ERROR] [${context}]`, message, error ?? '');
  }

  public getRecentLogs(): LogEntry[] {
    return [...this.inMemoryLogs];
  }

  public exportLogsAsJson(): string {
    return JSON.stringify(this.inMemoryLogs, null, 2);
  }

  public clearLogs() {
    this.inMemoryLogs = [];
  }
}

export const logger = new Logger();
