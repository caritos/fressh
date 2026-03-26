import cron from 'node-cron';
import { logger } from './logger.js';
export class Scheduler {
    tasks = new Map();
    schedule(cronExpression, name, callback) {
        if (this.tasks.has(name)) {
            logger.warn(`Task ${name} already scheduled, replacing...`);
            this.tasks.get(name)?.stop();
        }
        const task = cron.schedule(cronExpression, async () => {
            logger.debug(`Running scheduled task: ${name}`);
            try {
                await callback();
            }
            catch (error) {
                logger.error(`Error in scheduled task ${name}:`, error);
            }
        });
        this.tasks.set(name, task);
        logger.info(`Scheduled task: ${name} (${cronExpression})`);
    }
    stop(name) {
        const task = this.tasks.get(name);
        if (task) {
            task.stop();
            this.tasks.delete(name);
            logger.info(`Stopped task: ${name}`);
        }
    }
    stopAll() {
        for (const [name, task] of this.tasks) {
            task.stop();
            logger.info(`Stopped task: ${name}`);
        }
        this.tasks.clear();
    }
}
//# sourceMappingURL=scheduler.js.map