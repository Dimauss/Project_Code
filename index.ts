import 'source-map-support/register';
import { StartAgi, StopAgi } from './agi';
import { StartBot, StopBot } from './tg';
import { StartMqtt, StopMqtt } from './mqtt';

// Graceful shutdown
const exitProcessHandler = async () => {
    await Promise.all([StopAgi(), StopBot(), StopMqtt()]);
    console.log('App terminated');
    process.exit(0);
};

process
    .on('SIGINT', exitProcessHandler)
    .on('SIGTERM', exitProcessHandler)
    .on('uncaughtException', (err: Error) => {
        const message = err.message || '';
        console.error(`UncaughtException: \n message: ${message} \n stack: ${err.stack}`);
        // process.exit(1);
    })
    .on('unhandledRejection', (err: Error) => {
        const message = err.message || '';
        console.error(`UnhandledRejection: \n message: ${message} \n stack: ${err.stack}`);
        // process.exit(1);
    });

(async () => {
    try {
        await Promise.all([StartAgi(), StartBot(), StartMqtt()]);
        console.log('App started');
    } catch (error) {
        console.error(`Startup error: ${error.message}`);
        process.exit(1);
    }
})();
