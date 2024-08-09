import amqp, { Connection, Channel, ConfirmChannel, Options } from 'amqplib';
import { getConfig } from './config';
import logger from './logger';
import { RabbitMQError } from '../utils/error';
import { withRetry } from '../utils/retry';

interface RabbitMQConnection {
    connection: Connection | null;
    channel: Channel | ConfirmChannel | null;
}

const rabbitMQ: RabbitMQConnection = {
    connection: null,
    channel: null,
};

const RABBITMQ_CONFIG = {
    USERNAME: 'admin',
    PASSWORD: 'adminpassword',
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000,
};
export const RABBITMQ_URL_PRIMARY = 'amqp://admin:adminpassword@localhost:5672'
export const RABBITMQ_URL_SECONDARY = 'amqp://admin:adminpassword@localhost:5673'
let currentUrl = RABBITMQ_URL_PRIMARY;

// connect rabbitmq
async function connect(): Promise<void> {
    try {
        const conn = await amqp.connect(currentUrl);
        rabbitMQ.connection = conn;
        rabbitMQ.channel = await conn.createConfirmChannel();

        conn.on('error', async () => {
            rabbitMQ.connection = null;

            if (currentUrl === RABBITMQ_URL_PRIMARY) {
                console.log('Attempting to reconnect to secondary RabbitMQ server...');
                currentUrl = RABBITMQ_URL_SECONDARY;
            } else {
                console.log('Attempting to reconnect to primary RabbitMQ server...');
                currentUrl = RABBITMQ_URL_PRIMARY;
            }

            // Thử kết nối lại
            await retryConnection();
        });

        conn.on('error', (err) => {
            console.error(`RabbitMQ connection error at:`, err);
            rabbitMQ.connection = null;
        });

        conn.on('close', async () => {
            rabbitMQ.connection = null;

            if (currentUrl === RABBITMQ_URL_PRIMARY) {
                console.log('Attempting to reconnect to secondary RabbitMQ server...');
                currentUrl = RABBITMQ_URL_SECONDARY;
            } else {
                console.log('Attempting to reconnect to primary RabbitMQ server...');
                currentUrl = RABBITMQ_URL_PRIMARY;
            }

            // Thử kết nối lại
            await retryConnection();
        });
        return;
    } catch (err) {
        logger.error('RabbitMQ connection error:', err);
    }
    throw new Error('Failed to connect to any RabbitMQ host');
}

// retry connection
async function retryConnection() {
    connect()
}

// recreate channel khi thay đổi cluster 
async function recreateChannel(): Promise<void> {
    if (rabbitMQ.connection) {
        try {
            rabbitMQ.channel = await rabbitMQ.connection.createConfirmChannel();
            logger.info('Confirm channel recreated');
            // Tạo lại các queue
            await createQueueWithRetry('user_queue', { durable: true });
            await createQueueWithRetry('product_queue', { durable: true });
        } catch (error) {
            logger.error('Failed to recreate channel:', error);
        }
    } else {
    }
}

// cau hinh default queue
async function assertQueue(queue: string, options?: Options.AssertQueue): Promise<void> {
    if (!rabbitMQ.channel) {
        recreateChannel()
    }

    try {
        // Kiểm tra xem queue đã tồn tại chưa
        rabbitMQ.channel && await rabbitMQ.channel.checkQueue(queue);
        logger.info(`Queue ${queue} already exists, skipping assertion`);
    } catch (error) {
        // Nếu queue chưa tồn tại, tạo mới với options
        const defaultOptions: any = {
            durable: true,
            arguments: {
                'x-dead-letter-exchange': 'dlx'
            }
        };
        const mergedOptions = { ...defaultOptions, ...options };
        rabbitMQ.channel && await rabbitMQ.channel.assertQueue(queue, mergedOptions);
        logger.info(`Queue ${queue} asserted successfully`);
    }
}

// gui message
async function sendToQueue(
    queue: string,
    content: Buffer,
    options?: Options.Publish
): Promise<boolean> {
    if (!rabbitMQ.channel) {
        throw new RabbitMQError('Confirm channel not available');
    }
    try {
        const sent = rabbitMQ.channel.sendToQueue(queue, content, options);
        return sent;
    } catch (error) {
        logger.error('Failed to send message to queue', error);
        return false;
    }
}

// nhan message
async function consume(queue: string, onMessage: (msg: amqp.ConsumeMessage | null) => void, options?: Options.Consume): Promise<any> {
    if (!rabbitMQ.channel) {
        throw new RabbitMQError('Channel not available');
    }
    return rabbitMQ.channel.consume(queue, onMessage, options);
}
async function createQueueWithRetry(queue: string, options?: Options.AssertQueue): Promise<void> {
    await withRetry(async () => {
        if (!rabbitMQ.channel) {
            throw new RabbitMQError('Channel not available');
        }
        try {
            await rabbitMQ.channel.assertQueue(queue, { durable: true, ...options });
            logger.info(`Queue ${queue} created successfully`);
        } catch (error) {
            logger.error(`Error creating queue ${queue}:`, error);
            throw error;
        }
    }, RABBITMQ_CONFIG.MAX_RETRIES, RABBITMQ_CONFIG.RETRY_DELAY);
}
export {
    connect,
    assertQueue,
    sendToQueue,
    consume,
    rabbitMQ,
    RABBITMQ_CONFIG,
    createQueueWithRetry
};