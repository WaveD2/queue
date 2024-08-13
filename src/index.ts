import { userTaskV2Queue } from './services/user.queue';
import { rb } from './core/rabbitmq';
import logger from './core/logger';


async function main() {
    try {
        await rb.setupConnection();


        userTaskV2Queue.listenerQueue()

        for (let index = 0; index < 100; index++) {
            const fakeParams = {
                userId: `user ${index}`,
                task: {
                    labelId: `label ${index}`,
                    product: {
                        id: `product ${index}`,
                        name: `Product- ${index}`,
                    },
                    status: index,
                },
            };
            await new Promise(resolve => setTimeout(resolve, 1500));
            await userTaskV2Queue.sendLabelTaskToChecking({ data: fakeParams, options: { persistent: true } });
        }


    } catch (error) {
        logger.error('An error occurred:', error);
    }
}

main();