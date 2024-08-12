import { rb } from './core/rabbitmq';
import logger from './core/logger';
import { userTaskV2Queue } from './services/user.queue';


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
            // if (index === 30) {
            //     await rb.switchConnection();
            // }
        }


    } catch (error) {
        logger.error('An error occurred:', error);
    }
}

main();