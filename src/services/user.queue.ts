import { rb } from "../core/rabbitmq";
import { withRetry } from "../utils/retry";
import logger from "../core/logger";

export const userTaskV2Queue = {
    async sendLabelTaskToChecking(params: { data: any, options: any }): Promise<void> {
        const message = JSON.stringify(params.data);

        await withRetry(async () => {
            await rb.channel.assertQueue('user_queue', { durable: true });
            const sent = rb.channel.sendToQueue('user_queue', Buffer.from(message), params.options);

            if (!sent) {
                throw new Error('Failed to send message to queue');
            }
        });
    },

    async listenerQueueLabelTaskChecking(): Promise<void> {
        await withRetry(async () => {
            try {
                await rb.channel.assertQueue('user_queue', { durable: true });
                await rb.channel.consume('user_queue', async (msg: any) => {
                    if (msg) {
                        try {
                            const data = JSON.parse(msg.content.toString());
                            await processLabelTask(data);
                            if (rb.channel) {
                                rb.channel.ack(msg); // Xác nhận đã xử lý message
                            }
                        } catch (error) {
                            logger.error('Error processing message:', error);
                            if (rb.channel) {
                                rb.channel.nack(msg); // Không xác nhận nếu có lỗi
                            }
                        }
                    }
                });
            } catch (error) {
                logger.error('Error in listenerQueueLabelTaskChecking:', error);
            }
        });
    },

    listenerQueue: () => {
        userTaskV2Queue.listenerQueueLabelTaskChecking().then();
    }
};

async function processLabelTask(data: any) {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Kiểm tra trạng thái và cập nhật
    const numberRandom = Math.random()
    if (numberRandom < 0.5) { // Giả lập 80% thành công
        console.log(`\n Task  ${numberRandom} completed error : ${data.task.labelId}`);
        throw new Error(`Failed to process  ${numberRandom} completed error : ${data.task.labelId}`);
    } else {
        console.log(`\n Task ${numberRandom} completed successfully : ${data.task.labelId}`);
    }
    return true
}