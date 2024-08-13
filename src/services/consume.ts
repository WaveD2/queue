import { Channel, ConsumeMessage, Options } from 'amqplib';
import logger from '../core/logger';


/**
 *  mô tả các tùy chọn mặc định cho hàng đợi kiểu quorum.
 *
 * - `'x-queue-type'`: ` Kiểu hàng đợi
 * - `'x-quorum-initial-group-size'`: Số nhóm quorum
 * - `durable`: `true`
 */
export const DEFAULT_QUORUM_QUEUE_OPTIONS: Options.AssertQueue & {
    'x-queue-type'?: string;
    'x-quorum-initial-group-size'?: number;
} = Object.freeze({
    'x-queue-type': 'quorum',
    'x-quorum-initial-group-size': 3,
    durable: true,
});

// Định nghĩa kiểu của hàm xử lý thông điệp
type MessageHandler = (data: any) => Promise<void>;

interface ConsumeOptions {
    consumerOptions?: Options.Consume;
    assertOptions?: Options.AssertQueue & {
        'x-queue-type'?: string;
        'x-quorum-initial-group-size'?: number;
    };
    prefetchCount?: number; // Số lượng thông điệp tối đa mà consumer có thể nhận trước khi xử lý xong các thông điệp cũ
    retryOptions?: {
        maxAttempts: number; // Số lần thử lại tối đa khi xử lý thông điệp thất bại
        initialDelay: number; // Thời gian chờ ban đầu giữa các lần thử lại
        maxDelay: number; // Thời gian chờ tối đa giữa các lần thử lại
    };
}

/**
 * Thiết lập một consumer để xử lý message từ hàng đợi
 *
 * @param {Channel} channel - Kênh RabbitMQ để thiết lập consumer
 * @param {string} queueName - Tên hàng đợi cần tiêu thụ thông điệp
 * @param {MessageHandler} handler - Hàm xử lý thông điệp
 * @param {ConsumeOptions} options - Các tùy chọn cấu hình cho consumer
 * @returns {Promise<void>}
 */
export const setupConsumer = async (
    channel: Channel,
    queueName: string,
    handler: MessageHandler,
    options: ConsumeOptions
): Promise<void> => {
    const {
        consumerOptions = {},
        assertOptions = DEFAULT_QUORUM_QUEUE_OPTIONS,
        prefetchCount = 1,
        retryOptions = { maxAttempts: 3, initialDelay: 1000, maxDelay: 30000 }
    } = options;

    if (!channel) {
        throw new Error('No valid channel available');
    }

    await channel.assertQueue(queueName, assertOptions);

    // Thiết lập prefetch để giới hạn số lượng thông điệp mà consumer có thể xử lý cùng một lúc
    await channel.prefetch(prefetchCount);

    await channel.consume(queueName, async (msg: ConsumeMessage | null) => {
        if (msg === null) {
            logger.warn(`Consumer cancelled by server for queue: ${queueName}`); // Log cảnh báo nếu consumer bị hủy bởi server
            return;
        }

        let attempt = 0; // Số lần thử lại hiện tại
        let delay = retryOptions.initialDelay; // Thời gian chờ hiện tại trước khi thử lại

        // Hàm xử lý message với cơ chế retry
        const processMessage = async (): Promise<void> => {
            attempt++; // Tính toán số lần thử lại
            try {
                const data = JSON.parse(msg.content.toString());
                await handler(data); // Gọi hàm xử lý thông điệp
                channel.ack(msg); // Xác nhận thông điệp đã được xử lý thành công
            } catch (error: any) {
                if (attempt >= retryOptions.maxAttempts) {
                    try {
                        channel.reject(msg, false); // Từ chối thông điệp (không đưa lại hàng đợi)
                        return;
                    } catch (error) {
                        //Chờ khởi tạo lại channel queue cho trường hợp thay đổi cluster
                        await new Promise(resolve => setTimeout(resolve, 15000));
                    }
                } else {
                    console.log(`Retry attempt ${attempt} failed:`, error); // Log lỗi mỗi lần thử lại thất bại
                }
                delay = Math.min(delay * 2, retryOptions.maxDelay); // Tăng thời gian chờ giữa các lần thử lại (giới hạn bởi maxDelay)
                setTimeout(processMessage, delay); // Đặt thời gian chờ trước khi thử lại xử lý message
            }
        };

        await processMessage();
    }, consumerOptions);
};
