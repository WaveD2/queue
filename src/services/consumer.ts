import { consume, RABBITMQ_CONFIG, rabbitMQ, createQueueWithRetry } from '../core/rabbitmq';
import { withRetry } from '../utils/retry';
import logger from '../core/logger';
import { ConsumeMessage } from 'amqplib';

export async function startConsumers(): Promise<void> {
    await startConsumer('user_queue', processUser);
    await startConsumer('product_queue', processProduct);
}

async function startConsumer(queue: string, processor: (message: string) => Promise<void>): Promise<void> {
    await withRetry(async () => {
        await createQueueWithRetry(queue, { durable: true });
        await consume(queue, async (msg: ConsumeMessage | null) => {
            if (msg && rabbitMQ.channel) {
                const content = msg.content.toString();
                try {
                    await processor(content);
                    rabbitMQ.channel.ack(msg);
                    logger.info(`Message successfully: ${content}`);
                } catch (error) {
                    logger.error(`Error message: ${error}`);
                    const retryCount = (msg.properties.headers['x-retry-count'] || 0) + 1;
                    if (retryCount <= RABBITMQ_CONFIG.MAX_RETRIES) {
                        rabbitMQ.channel.nack(msg, false, false);
                        await sendToRetryQueue(queue, content, retryCount);
                    } else {
                        logger.warn(`Message max retries, sending: ${content}`);
                        rabbitMQ.channel.nack(msg, false, false);
                    }
                }
            }
        }, { noAck: false });
    }, RABBITMQ_CONFIG.MAX_RETRIES, RABBITMQ_CONFIG.RETRY_DELAY);
}

async function processUser(message: string): Promise<void> {
    const user = JSON.parse(message);
    await new Promise(resolve => setTimeout(resolve, 2000));
    const random = Math.random();
    if (random < 0.5) {
        throw new Error(`Random product processing error ${random} : ${user.name}`);
    }
}

async function processProduct(message: string): Promise<void> {
    const product = JSON.parse(message);
    await new Promise(resolve => setTimeout(resolve, 2000));
    const random = Math.random();
    if (random < 0.5) {
        throw new Error(`Random product processing error ${random}  : ${product.name}`);
    }
}

async function sendToRetryQueue(originalQueue: string, message: string, retryCount: number): Promise<void> {
    const retryQueue = `${originalQueue}_retry`;
    const retryDelay = Math.pow(2, retryCount) * 1000;

    await createQueueWithRetry(retryQueue, {
        durable: true,
        deadLetterExchange: '',
        deadLetterRoutingKey: originalQueue,
        messageTtl: retryDelay
    });

    if (rabbitMQ.channel) {
        await rabbitMQ.channel.sendToQueue(retryQueue, Buffer.from(message), {
            headers: { 'x-retry-count': retryCount }
        });
    } else {
        throw new Error('Channel not available for sending to retry queue');
    }
}