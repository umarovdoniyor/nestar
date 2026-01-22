import { Injectable } from '@nestjs/common';

@Injectable()
export class BatchService {
  getHello(): string {
    return 'Welcome to Nestar BATCH Service!';
  }

  public async batchRollback(): Promise<void> {
    // Implement rollback logic here
    console.log('batchRollback');
  }
  public async batchProperties(): Promise<void> {
    // Implement top properties logic here
    console.log('batchProperties');
  }
  public async batchAgents(): Promise<void> {
    // Implement top agents logic here
    console.log('batchAgents');
  }

  // END class
}
