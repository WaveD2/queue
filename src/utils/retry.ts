import { RetryableError } from '../utils/error';
import logger from '../core/logger';

export async function withRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000
): Promise<T> {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            if (err instanceof RetryableError) {
                logger.warn(`Attempt ${attempt} failed:`, err);
                lastError = err;
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            } else {
                throw err;
            }
        }
    }
    throw lastError || new Error('All retry max 3');
}