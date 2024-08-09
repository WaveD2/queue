import { connect } from './core/rabbitmq';
import { startConsumers } from './services/consumer';
import { sendSampleData, startContinuousSending } from './services/producer';
import logger from './core/logger';

async function main() {
    try {
        await connect();
        // cau hinh producer/consumer
        await sendSampleData();
        await startConsumers();

        // Bắt đầu gửi dữ liệu liên tục
        startContinuousSending(5000); // Gửi mỗi 5 giây

    } catch (error) {
        logger.error('An error occurred:', error);
    }
}

main();