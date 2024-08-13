import amqp, { Connection, ConfirmChannel, Options } from 'amqplib';
import logger from './logger';
import { userTaskV2Queue } from '../services/user.queue';

const RABBITMQ_CONFIG = {
    MAX_RETRIES: 3,
    RETRY_DELAY: 5000,
    HEARTBEAT: 60,
};

export const RABBITMQ_URLS = [
    'amqp://localhost:25672',
    'amqp://localhost:25673',
    'amqp://localhost:25674',
];

/**
 * chứa thông tin về kết nối và kênh RabbitMQ hiện tại
 *
 * @property {Connection | null} connection - Kết nối đến RabbitMQ hiện tại
 * @property {ConfirmChannel | null} channel - Kênh RabbitMQ hiện tại
 * @property {number} currentUrlIndex - Chỉ số của URL RabbitMQ hiện tại trong mảng RABBITMQ_URLS
 * @property {number[]} lastUsedUrls - Một mảng chứa các chỉ số của URL RabbitMQ đã được sử dụng,
 * được sử dụng để xác định khi nào nên thay đổi URL kết nối
 * 
 */

const RabbitMQManager = {
    connection: null as Connection | null,
    channel: null as ConfirmChannel | null,
    currentUrlIndex: 0,
    lastUsedUrls: [] as number[],

    // Khoi tao
    async connect(): Promise<void> {
        try {
            const connectionOptions: Options.Connect = {
                heartbeat: RABBITMQ_CONFIG.HEARTBEAT,
            };

            this.connection = await amqp.connect(RABBITMQ_URLS[this.currentUrlIndex], connectionOptions);
            this.channel = await this.connection.createConfirmChannel();

            this.connection.on('error', this.handleConnectionError.bind(this));
            this.connection.on('close', this.handleConnectionClose.bind(this));

            logger.info(`Connected to RabbitMQ at ${RABBITMQ_URLS[this.currentUrlIndex]}`);
            this.lastUsedUrls = [this.currentUrlIndex];

        } catch (err) {
            await this.switchConnection();
        }
    },

    async handleConnectionError(err: any): Promise<void> {
        await this.switchConnection();
    },

    async handleConnectionClose(): Promise<void> {
        await this.switchConnection();
    },

    async switchConnection(): Promise<void> {
        const availableUrls = RABBITMQ_URLS.length;
        let nextUrlIndex;

        do {
            nextUrlIndex = (this.currentUrlIndex + 1) % availableUrls;
        } while (this.lastUsedUrls.includes(nextUrlIndex) && this.lastUsedUrls.length < availableUrls);

        if (this.lastUsedUrls.length >= availableUrls) {
            this.lastUsedUrls = [];
        }

        this.currentUrlIndex = nextUrlIndex;
        this.lastUsedUrls.push(this.currentUrlIndex);

        await this.retryConnection();
    },

    async retryConnection(): Promise<void> {
        for (let attempts = 0; attempts < RABBITMQ_CONFIG.MAX_RETRIES; attempts++) {
            try {
                await this.connect();
                // Khởi động lại queue khi thay đổi cluster
                await userTaskV2Queue.listenerQueue();
                return;
            } catch (error) {
                logger.info(`Retrying connection... (${attempts + 1}/${RABBITMQ_CONFIG.MAX_RETRIES})`);
                await new Promise((resolve) => setTimeout(resolve, RABBITMQ_CONFIG.RETRY_DELAY));
            }
        }
        logger.error('Failed to DDconnect to any RabbitMQ node after maximum retries.');
    },

    getChannel(): ConfirmChannel | null {
        return this.channel;
    },

    getConnection(): Connection | null {
        return this.connection;
    },
};

/**
 * @description
 * Object rb is a wrapper for RabbitMQManager.
 * It provides a simpler and more readable way to access RabbitMQManager's methods.
 *
 * @property {() => Promise<void>} setupConnection - Setup RabbitMQ connection.
 * @property {Connection} connection - Get RabbitMQ connection.
 * @property {ConfirmChannel} channel - Get RabbitMQ channel.
 * @property {() => Promise<void>} switchConnection - Switch RabbitMQ connection.
 * @property {() => ConfirmChannel | null} getChannel - Get RabbitMQ channel.
 */
export const rb = {
    /**
     * Setup RabbitMQ connection.
     * @return {Promise<void>} Promise that resolves when connection is established.
     */
    setupConnection: RabbitMQManager.connect.bind(RabbitMQManager),

    /**
     * Get RabbitMQ connection.
     * @return {Connection} RabbitMQ connection.
     */
    get connection() {
        return RabbitMQManager.connection;
    },

    /**
     * Get RabbitMQ channel.
     * @return {ConfirmChannel} RabbitMQ channel.
     */
    get channel() {
        return RabbitMQManager.channel;
    },

    /**
     * Switch RabbitMQ connection.
     * @return {Promise<void>} Promise that resolves when connection is switched.
     */
    switchConnection: RabbitMQManager.switchConnection.bind(RabbitMQManager),

    /**
     * Get RabbitMQ channel.
     * @return {ConfirmChannel | null} RabbitMQ channel or null if channel is not available.
     */
    getChannel: RabbitMQManager.getChannel.bind(RabbitMQManager),
} as {
    connection: Connection,
    channel: ConfirmChannel,
    switchConnection: () => Promise<void>,
    setupConnection: () => Promise<void>,
    getChannel: () => ConfirmChannel | null,
};
