import { setupConsumer } from './consume';
import logger from '../core/logger';
import { rb } from '../core/rabbitmq';

const QUEUE_NAME = 'user_queue2';

const QUORUM_QUEUE_OPTIONS = {
    'x-queue-type': 'quorum',
    'x-quorum-initial-group-size': 3,
    durable: true,
};

export const userTaskV2Queue = {
    async sendLabelTaskToChecking(params: { data: any, options: any }): Promise<void> {
        const channel = rb.getChannel();
        if (!channel) {
            throw new Error('No valid channel available');
        }
        await channel.assertQueue(QUEUE_NAME, { ...QUORUM_QUEUE_OPTIONS });
        const message = JSON.stringify(params.data);
        const sent = channel.sendToQueue(QUEUE_NAME, Buffer.from(message), {
            persistent: true,
            ...params.options
        });

        if (!sent) {
            throw new Error('Failed to send message to queue');
        }
    },

    async listenerQueueLabelTaskChecking(): Promise<void> {
        const channel = rb.getChannel();
        if (!channel) {
            throw new Error('No valid channel available');
        }

        await setupConsumer(
            channel,
            QUEUE_NAME,
            processLabelTask,
            {
                assertOptions: {
                    ...QUORUM_QUEUE_OPTIONS,
                    'x-quorum-initial-group-size': 5,
                },
                prefetchCount: 5,
                retryOptions: {
                    maxAttempts: 3,
                    initialDelay: 2000,
                    maxDelay: 30000
                },
            }
        );
    },

    listenerQueue: () => {
        userTaskV2Queue.listenerQueueLabelTaskChecking().catch(error => {
            console.log('Error in listenerQueue:', error);
        });
    }
};

async function processLabelTask(data: any): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const numberRandom = Math.random();
    if (numberRandom < 0.5) {
        console.log(`Error ${numberRandom}: ${data.task.labelId}`);
        throw new Error(`Error ${numberRandom} in :: ${data.task.labelId}`);
    } else {
        logger.info(`Successfully processed ${numberRandom}: ${data.task.labelId}`);
    }
}
