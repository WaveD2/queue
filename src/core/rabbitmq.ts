import amqp, { Connection, Channel, ConfirmChannel, Options } from 'amqplib';
import logger from './logger';
import { userTaskV2Queue } from '../services/user.queue';

const RABBITMQ_CONFIG = {
    MAX_RETRIES: 5,
    RETRY_DELAY: 5000,
};

export const RABBITMQ_URLS = [
    'amqp://admin:adminpassword@localhost:5672',
    'amqp://admin:adminpassword@localhost:5673',
    'amqp://admin:adminpassword@localhost:5674',
];

const RabbitMQManager = {
    connection: null as Connection | null,
    channel: null as ConfirmChannel | null,
    currentUrlIndex: 0,

    async connect(): Promise<void> {
        try {
            this.connection = await amqp.connect(RABBITMQ_URLS[this.currentUrlIndex]);
            this.channel = await this.connection.createConfirmChannel();

            this.connection.on('error', this.handleConnectionError.bind(this));
            this.connection.on('close', this.handleConnectionClose.bind(this));

            logger.info(`Connected to RabbitMQ at ${RABBITMQ_URLS[this.currentUrlIndex]}`);
        } catch (err) {
            logger.error('RabbitMQ connection error:', err);
            await this.switchConnection();
        }
    },

    async handleConnectionError(err: any): Promise<void> {
        logger.warn('RabbitMQ connection error:', err);
        await this.switchConnection();
    },

    async handleConnectionClose(): Promise<void> {
        logger.warn('RabbitMQ connection closed.');
        await this.switchConnection();
    },


    async switchConnection(): Promise<void> {
        this.currentUrlIndex = (this.currentUrlIndex + 1) % RABBITMQ_URLS.length;
        await this.closeConnectionAndChannel();
        await this.retryConnection();
    },

    async closeConnectionAndChannel(): Promise<void> {
        if (this.channel) {
            try {
                await this.channel.close();
            } catch (err) {
                logger.error('Failed to close channel:', err);
            } finally {
                this.channel = null;
            }
        }

        if (this.connection) {
            try {
                await this.connection.close();
            } catch (err) {
                logger.error('Failed to close connection:', err);
            } finally {
                this.connection = null;
            }
        }
    },

    async retryConnection(): Promise<void> {
        for (let attempts = 0; attempts < RABBITMQ_CONFIG.MAX_RETRIES; attempts++) {
            try {
                await this.connect();
                userTaskV2Queue.listenerQueue();
                return;
            } catch (error) {
                logger.info(`Retrying connection... (${attempts + 1}/${RABBITMQ_CONFIG.MAX_RETRIES})`);
                await new Promise((resolve) => setTimeout(resolve, RABBITMQ_CONFIG.RETRY_DELAY));
            }
        }
        logger.error('Failed to connect to RabbitMQ after maximum retries');
    },

    getChannel(): ConfirmChannel | null {
        return this.channel;
    },

    getConnection(): Connection | null {
        return this.connection;
    },
};

export const rb = {
    setupConnection: RabbitMQManager.connect.bind(RabbitMQManager),
    get connection() {
        return RabbitMQManager.connection;
    },
    get channel() {
        return RabbitMQManager.channel;
    },
    switchConnection: RabbitMQManager.switchConnection.bind(RabbitMQManager),
    getChannel: RabbitMQManager.getChannel.bind(RabbitMQManager),
} as {
    connection: Connection,
    channel: ConfirmChannel,
    switchConnection: () => Promise<void>,
    setupConnection: () => Promise<void>,
    getChannel: () => ConfirmChannel | null
};