import { Module } from '@nestjs/common';
import { KpiPeriodsController } from './kpi-periods.controller';
import { KpiPeriodsService } from './kpi-periods.service';

@Module({
  controllers: [KpiPeriodsController],
  providers: [KpiPeriodsService],
})
export class KpiPeriodsModule {}
