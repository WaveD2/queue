import { rb } from "../core/rabbitmq";
import { withRetry } from "../utils/retry";
import logger from "../core/logger";
import { Channel, ConsumeMessage } from "amqplib";

const QUORUM_QUEUE_OPTIONS = {
    'x-queue-type': 'quorum',
    'x-quorum-initial-group-size': 3,
    durable: true,
}

export const userTaskV2Queue = {
    currentChannel: null as Channel | null,

    async sendLabelTaskToChecking(params: { data: any, options: any }): Promise<void> {
        const message = JSON.stringify(params.data);

        await withRetry(async () => {
            const channel = rb.getChannel();
            if (!channel) {
                throw new Error('No valid channel available');
            }
            await channel.assertQueue('user_queue', { ...QUORUM_QUEUE_OPTIONS });
            const sent = channel.sendToQueue('user_queue', Buffer.from(message), params.options);

            if (!sent) {
                throw new Error('Failed to send message to queue');
            }
        });
    },

    async listenerQueueLabelTaskChecking(): Promise<void> {
        await withRetry(async () => {
            try {
                const newChannel = rb.getChannel();
                if (!newChannel) {
                    throw new Error('No valid channel available');
                }

                if (this.currentChannel) {
                    try {
                        await this.currentChannel.cancel('user_queue_consumer');
                    } catch (error) {
                        logger.warn('Error cancelling previous consumer:', error);
                    }
                }

                this.currentChannel = newChannel;

                await this.currentChannel.assertQueue('user_queue', { ...QUORUM_QUEUE_OPTIONS });
                await this.currentChannel.consume('user_queue', this.messageHandler.bind(this), { consumerTag: 'user_queue_consumer' });

                logger.info('Started new consumer on updated channel');
            } catch (error) {
                logger.error('Error in listenerQueueLabelTaskChecking:', error);
            }
        });
    },

    async messageHandler(msg: ConsumeMessage | null): Promise<void> {
        if (msg) {
            try {
                const data = JSON.parse(msg.content.toString());
                await processLabelTask(data);
                if (this.currentChannel) {
                    this.currentChannel.ack(msg);
                }
            } catch (error) {
                logger.error('Error processing message:', error);
                if (this.currentChannel) {
                    this.currentChannel.nack(msg);
                }
            }
        }
    },

    listenerQueue: () => {
        userTaskV2Queue.listenerQueueLabelTaskChecking().catch(error => {
            logger.error('Error in listenerQueue:', error);
        });
    }
};
async function processLabelTask(data: any) {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const numberRandom = Math.random()
    if (numberRandom < 0.5) {
        throw new Error(` ${numberRandom}: ${data.task.labelId}`);
    } else {
        console.log(` ${numberRandom}: ${data.task.labelId}`);

    }
    return true
}