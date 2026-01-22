import { Controller, Get, Logger } from '@nestjs/common';
import { BatchService } from './batch.service';
import { Cron, Interval, Timeout } from '@nestjs/schedule';
import { BATCH_ROLLBACK, BATCH_TOP_AGENTS, BATCH_TOP_PROPERTIES } from './lib/config';

@Controller()
export class BatchController {
  private logger: Logger = new Logger('BartchController');
  constructor(private readonly batchService: BatchService) {}

  @Cron('00 * * * * *', { name: BATCH_ROLLBACK })
  public async batchRollback() {
    try {
      this.logger['context'] = BATCH_ROLLBACK;
      this.logger.debug('EXECUTING BATCH ROLLBACK TASK');
      await this.batchService.batchRollback();
    } catch (err) {
      this.logger.error(`BATCH ROLLBACK TASK ERROR: ${err.message}`);
    }
  }

  @Cron('20 * * * * *', { name: BATCH_TOP_PROPERTIES })
  public async batchProperties() {
    try {
      this.logger['context'] = BATCH_TOP_PROPERTIES;
      this.logger.debug('EXECUTING BATCH TOP PROPERTIES TASK');
      await this.batchService.batchProperties();
    } catch (err) {
      this.logger.error(`BATCH TOP PROPERTIES TASK ERROR: ${err.message}`);
    }
  }

  @Cron('40 * * * * *', { name: BATCH_TOP_AGENTS })
  public async batchAgents() {
    try {
      this.logger['context'] = BATCH_TOP_AGENTS;
      this.logger.debug('EXECUTING BATCH TOP AGENTS TASK');
      await this.batchService.batchAgents();
    } catch (err) {
      this.logger.error(`BATCH TOP AGENTS TASK ERROR: ${err.message}`);
    }
  }

  /* @Timeout(5000)
  handleTimeout() {
    this.logger.debug('Timeout task executed after 5 seconds');
  }*/

  /*
  @Interval(2000)
  handleInterval() {
    this.logger.debug('Interval task running every 2 seconds');
  }*/

  @Get()
  getHello(): string {
    return this.batchService.getHello();
  }

  // END class
}
