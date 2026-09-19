export interface RetryConfig {
  baseDelayMs: number;
  maxDelayMs: number;
  maxAttempts: number;
  jitterFactor: number; // 0 to 1
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  maxAttempts: 5,
  jitterFactor: 0.25,
};

export class RetryManager {
  private config: RetryConfig;
  private activeTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private activeCountdownIntervalId: ReturnType<typeof setInterval> | null = null;
  private remainingSeconds: number = 0;
  private countdownCallbacks: Set<(seconds: number) => void> = new Set();

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
  }

  /**
   * Calculates exponential backoff with randomized jitter:
   * delay = min(maxDelay, baseDelay * 2^attempt) * (1 +/- jitter)
   */
  public calculateBackoff(attempt: number, customConfig?: Partial<RetryConfig>): number {
    const cfg = { ...this.config, ...customConfig };
    const exponentialDelay = Math.min(
      cfg.maxDelayMs,
      cfg.baseDelayMs * Math.pow(2, Math.max(0, attempt - 1))
    );

    // Add jitter: e.g. jitterFactor 0.25 gives range [0.75, 1.25]
    const jitterMultiplier = 1 + (Math.random() * 2 - 1) * cfg.jitterFactor;
    return Math.round(exponentialDelay * jitterMultiplier);
  }

  /**
   * Determines if a failed sync item is eligible for another retry
   */
  public shouldRetry(attempts: number, maxAttempts?: number, error?: unknown): boolean {
    const limit = maxAttempts ?? this.config.maxAttempts;
    if (attempts >= limit) {
      return false;
    }

    if (error && !this.isRetryableError(error)) {
      return false;
    }

    return true;
  }

  /**
   * Differentiates transient network/service errors from permanent invalid data errors
   */
  public isRetryableError(error: unknown): boolean {
    if (!error) return true;

    const errorMsg =
      typeof error === 'string'
        ? error
        : (error as { message?: string })?.message || String(error);

    const nonRetryableKeywords = [
      'duplicate key value violates unique constraint', // handled by conflict resolver, not retry
      'invalid input syntax',
      'violates foreign key constraint',
      'null value in column',
      'permission denied',
      'PGRST116', // Row not found where exactly one was requested
    ];

    const lower = errorMsg.toLowerCase();
    for (const kw of nonRetryableKeywords) {
      if (lower.includes(kw.toLowerCase())) {
        return false;
      }
    }

    return true;
  }

  /**
   * Schedules a retry with countdown ticker
   */
  public scheduleRetry(
    callback: () => Promise<void> | void,
    delayMs: number,
    onTick?: (secondsRemaining: number) => void
  ): void {
    this.cancelScheduledRetry();

    this.remainingSeconds = Math.max(1, Math.round(delayMs / 1000));
    if (onTick) onTick(this.remainingSeconds);
    this.countdownCallbacks.forEach(cb => cb(this.remainingSeconds));

    this.activeCountdownIntervalId = setInterval(() => {
      this.remainingSeconds = Math.max(0, this.remainingSeconds - 1);
      if (onTick) onTick(this.remainingSeconds);
      this.countdownCallbacks.forEach(cb => cb(this.remainingSeconds));

      if (this.remainingSeconds <= 0 && this.activeCountdownIntervalId) {
        clearInterval(this.activeCountdownIntervalId);
        this.activeCountdownIntervalId = null;
      }
    }, 1000);

    this.activeTimeoutId = setTimeout(async () => {
      this.cancelScheduledRetry();
      await callback();
    }, delayMs);
  }

  /**
   * Cancels any active pending retry timer
   */
  public cancelScheduledRetry(): void {
    if (this.activeTimeoutId) {
      clearTimeout(this.activeTimeoutId);
      this.activeTimeoutId = null;
    }
    if (this.activeCountdownIntervalId) {
      clearInterval(this.activeCountdownIntervalId);
      this.activeCountdownIntervalId = null;
    }
    this.remainingSeconds = 0;
  }

  public getRemainingSeconds(): number {
    return this.remainingSeconds;
  }

  public subscribeCountdown(cb: (seconds: number) => void): () => void {
    this.countdownCallbacks.add(cb);
    return () => this.countdownCallbacks.delete(cb);
  }
}

export const retryManager = new RetryManager();
