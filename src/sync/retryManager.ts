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

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
  }

  /**
   * Calculates exponential backoff with randomized jitter:
   * delay = min(maxDelay, baseDelay * 2^attempt) * (1 +/- jitter)
   */
  calculateBackoff(attempt: number, customConfig?: Partial<RetryConfig>): number {
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
  shouldRetry(attempts: number, maxAttempts?: number, error?: unknown): boolean {
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
  isRetryableError(error: unknown): boolean {
    if (!error) return true;

    const errorMsg = typeof error === 'string' 
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
}

export const retryManager = new RetryManager();
