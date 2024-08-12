import amqp, { Connection, Channel, ConfirmChannel, Options } from 'amqplib';
import logger from './logger';
import { userTaskV2Queue } from '../services/user.queue';

const RABBITMQ_CONFIG = {
    MAX_RETRIES: 5,
    RETRY_DELAY: 5000,
    QUORUM_QUEUE_NAME: 'my_quorum_queue',
    QUORUM_QUEUE_OPTIONS: {
        'x-queue-type': 'quorum' as const,
        'x-quorum-initial-group-size': 3,
        durable: true,
    },
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

            this.channel.on('error', this.handleChannelError.bind(this));
            this.channel.on('close', this.handleChannelClose.bind(this));

            await this.setupQuorumQueue();
            await userTaskV2Queue.listenerQueue();

            logger.info(`Connected to RabbitMQ at ${RABBITMQ_URLS[this.currentUrlIndex]}`);
        } catch (err) {
            logger.error('RabbitMQ connection error:', err);
            await this.switchConnection();
        }
    },

    async setupQuorumQueue(): Promise<void> {
        if (!this.channel) {
            throw new Error('Channel not initialized');
        }

        await this.channel.assertQueue(
            RABBITMQ_CONFIG.QUORUM_QUEUE_NAME,
            RABBITMQ_CONFIG.QUORUM_QUEUE_OPTIONS
        );
    },

    async handleConnectionError(err: any): Promise<void> {
        logger.warn('RabbitMQ connection error:', err);
        await this.switchConnection();
    },

    async handleConnectionClose(): Promise<void> {
        logger.warn('RabbitMQ connection closed.');
        await this.switchConnection();
    },

    async handleChannelError(err: any): Promise<void> {
        logger.warn('RabbitMQ channel error:', err);
        if (err.message.includes('PRECONDITION_FAILED')) {
            await this.recreateChannel();
        }
    },

    async handleChannelClose(): Promise<void> {
        logger.warn('RabbitMQ channel closed.');
        await this.recreateChannel();
    },

    async recreateChannel(): Promise<void> {
        if (this.connection && this.connection.connection) {
            try {
                this.channel = await this.connection.createConfirmChannel();
                this.channel.on('error', this.handleChannelError.bind(this));
                this.channel.on('close', this.handleChannelClose.bind(this));
                await this.setupQuorumQueue();
                await userTaskV2Queue.listenerQueue();
                logger.info('RabbitMQ channel recreated successfully');
            } catch (err) {
                logger.error('Failed to recreate channel:', err);
                await this.switchConnection();
            }
        } else {
            await this.switchConnection();
        }
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
                return;
            } catch (error) {
                logger.info(`Retrying connection... (${attempts + 1}/${RABBITMQ_CONFIG.MAX_RETRIES})`);
                await new Promise((resolve) => setTimeout(resolve, RABBITMQ_CONFIG.RETRY_DELAY));
            }
        }
        logger.error('Failed to connect to RabbitMQ after maximum retries');
    },

    async sendToQueue(queue: string, content: Buffer, options?: Options.Publish): Promise<boolean> {
        const channel = this.getChannel();
        if (!channel) {
            throw new Error('Channel not available');
        }
        try {
            const sent = await channel.sendToQueue(queue, content, options);
            return sent;
        } catch (error: any) {
            logger.error('Failed to send message to queue:', error);
            if (error.message.includes('PRECONDITION_FAILED')) {
                await this.recreateChannel();
                return this.sendToQueue(queue, content, options);
            }
            return false;
        }
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