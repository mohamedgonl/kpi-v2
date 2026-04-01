import { Controller, Get, UseGuards, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('personal')
  getPersonal(@CurrentUser() user: any, @Query('period_id') periodId: string) {
    return this.dashboardService.getPersonalDashboard(user.id, periodId);
  }

  @UseGuards(RolesGuard)
  @Roles('admin', 'vu_truong', 'vu_pho')
  @Get('summary')
  getSummary(@Query('period_id') periodId: string) {
    return this.dashboardService.getSummaryDashboard(periodId);
  }

  @UseGuards(RolesGuard)
  @Roles('admin', 'vu_truong', 'vu_pho')
  @Get('leaderboard')
  getLeaderboard(@Query('period_id') periodId: string) {
    return this.dashboardService.getLeaderboard(periodId);
  }
}
