import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { KpiCalculatorService } from './kpi-calculator.service';

@Module({
  controllers: [TasksController],
  providers: [TasksService, KpiCalculatorService],
  exports: [KpiCalculatorService]
})
export class TasksModule {}
