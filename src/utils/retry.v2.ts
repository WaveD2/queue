import { Channel, Connection, ConsumeMessage } from "amqplib";

//các tùy chọn cho cơ chế retry.
interface RetryOptions {
    maxAttempts: number;
    initialDelay: number;
    maxDelay: number;
    backoffFactor: number;
    retryableErrors?: string[];
}

//thông tin về kết nối RabbitMQ.
interface RabbitMQContext {
    channel?: Channel;
    connection?: Connection;
    queue?: string;
}

//Giá trị mặc định cho các tùy chọn retry.
const defaultRetryOptions: RetryOptions = {
    maxAttempts: 5,
    initialDelay: 1000,
    maxDelay: 60000,
    backoffFactor: 2,
    retryableErrors: ['PRECONDITION_FAILED', 'CONNECTION_CLOSED'],
};

export async function retryOperation<T>(
    operation: (context: RabbitMQContext) => Promise<T>,
    context: RabbitMQContext,
    options: Partial<RetryOptions> = {}
): Promise<T> {
    const retryOptions: RetryOptions = { ...defaultRetryOptions, ...options };
    let attempt = 0;
    let delay = retryOptions.initialDelay;

    while (attempt < retryOptions.maxAttempts) {
        try {
            return await operation(context);
        } catch (error: any) {
            attempt++;
            if (
                attempt >= retryOptions.maxAttempts ||
                (retryOptions.retryableErrors &&
                    !retryOptions.retryableErrors.includes(error.code))
            ) {
                throw error;
            }

            console.log(`Retry attempt ${attempt} after ${delay}ms`);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay = Math.min(delay * retryOptions.backoffFactor, retryOptions.maxDelay);

        }
    }
    throw new Error('Max retry attempts reached');
}


// việc gửi message
export async function retrySend(
    channel: Channel,
    queue: string,
    content: Buffer,
    options: Partial<RetryOptions> = {}
): Promise<void> {
    await retryOperation(
        async (ctx) => {
            await ctx.channel!.sendToQueue(queue, content);
        },
        { channel, queue },
        options
    );
}

// việc consume
export async function retryConsume(
    channel: Channel,
    queue: string,
    onMessage: (msg: ConsumeMessage | null) => void,
    options: Partial<RetryOptions> = {}
): Promise<void> {
    await retryOperation(
        async (ctx) => {
            await ctx.channel!.consume(ctx.queue!, onMessage);
        },
        { channel, queue },
        options
    );
}
