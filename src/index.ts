import {
    type as osType,
    cpus as osCpus,
    freemem as osFreeMem,
    totalmem as osTotalMem
} from 'os';
import {
    ENV_DISCOVERY_HANDLERS_DIRECTORY
} from './consts';
import { OnvifJsDiscoveryHandler } from './discovery';
import { forget } from './utils';

// process.on('unhandledRejection', (e: any) => {
/* eslint-disable */
//     console.log(['startup', 'error'], `Excepction on startup... ${e.message}`);
//     console.log(['startup', 'error'], e.stack);
/* eslint-enable */
// });
type LoggerFunc = (tags: string[], message: string) => void;

export interface IAppConfig {
    agentDiscoveryHandlersSocketDirectory: string;
    logger: LoggerFunc;
}

const logger = (tags: string[], message: string) => {
    // eslint-disable-next-line no-console
    console.log(`[${tags.join(', ')}], ${message}`);
};

async function start() {
    try {
        const stopServer = async () => {
            logger(['shutdown', 'info'], '☮︎ Stopping instance');

            logger(['shutdown', 'info'], `⏏︎ Instance stopped`);
            process.exit(0);
        };

        process.on('SIGINT', stopServer);
        process.on('SIGTERM', stopServer);

        logger(['startup', 'info'], `🚀 Starting instance...`);

        logger(['startup', 'info'], `✅ Instance started`);
        logger(['startup', 'info'], ` > Machine: ${osType()}, ${osCpus().length} core, ` +
            `freemem=${(osFreeMem() / 1024 / 1024).toFixed(0)}mb, totalmem=${(osTotalMem() / 1024 / 1024).toFixed(0)}mb`);

        const appConfig: IAppConfig = {
            agentDiscoveryHandlersSocketDirectory: process.env[ENV_DISCOVERY_HANDLERS_DIRECTORY],
            logger
        };

        if (!appConfig.agentDiscoveryHandlersSocketDirectory) {
            logger(['startup', 'error'], 'Error - no environment variables for agent discovery handler directory or agent socket name');

            return;
        }

        const discoveryHandler = new OnvifJsDiscoveryHandler(appConfig);

        await discoveryHandler.init();
    }
    catch (ex) {
        logger(['startup', 'error'], `👹 Error starting server: ${ex.message}`);
    }
}

forget(start);
