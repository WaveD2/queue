import { assertQueue, sendToQueue, RABBITMQ_CONFIG, createQueueWithRetry } from '../core/rabbitmq';
import { withRetry } from '../utils/retry';
import logger from '../core/logger';
import { ProducerError } from '../utils/error';
import { Options } from 'amqplib';
import { users } from '../data/user';
import { products } from '../data/prodcut';

interface SendMessageOptions {
    priority?: number;
    expiration?: string | number;
    correlationId?: string;
    headers?: { [key: string]: any };
}

// gui message toi queue
export async function sendMessage(
    queue: string,
    message: string | Buffer,
    options: SendMessageOptions = {}
): Promise<void> {
    await withRetry(async () => {
        try {

            await createQueueWithRetry(queue, { durable: true });

            // await assertQueue(queue, { durable: true });

            const content = Buffer.isBuffer(message) ? message : Buffer.from(message);
            const publishOptions: Options.Publish = {
                persistent: true,
                priority: options.priority,
                expiration: options.expiration,
                correlationId: options.correlationId,
                headers: options.headers,
            };

            const sent = await sendToQueue(queue, content, publishOptions);

            if (sent) {
                logger.info(`Message sent to queue ${queue}: ${content.toString()}`);
            } else {
                throw new ProducerError('Failed to send message to the queue');
            }
        } catch (error) {
            logger.error(`Error sending message to queue ${queue}:`, error);
            throw error;
        }
    }, RABBITMQ_CONFIG.MAX_RETRIES, RABBITMQ_CONFIG.RETRY_DELAY);
}


// vong lap send messsage
export async function sendSampleData(): Promise<void> {
    for (const user of users) {
        await sendMessage('user_queue', JSON.stringify(user));
    }
    for (const product of products) {
        await sendMessage('product_queue', JSON.stringify(product));
    }
}

// vong lap de tao task gui
export async function startContinuousSending(interval: number = 5000): Promise<void> {
    setInterval(async () => {
        const randomUser = users[Math.floor(Math.random() * users.length)];
        const randomProduct = products[Math.floor(Math.random() * products.length)];

        await sendMessage('user_queue', JSON.stringify(randomUser));
        await sendMessage('product_queue', JSON.stringify(randomProduct));
    }, interval);
}