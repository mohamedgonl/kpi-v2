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
  getPersonal(@CurrentUser() user: any, @Query('start_date') startDate: string, @Query('end_date') endDate: string) {
    return this.dashboardService.getPersonalDashboard(user.id, startDate, endDate);
  }

  @UseGuards(RolesGuard)
  @Roles('admin', 'vu_truong', 'vu_pho')
  @Get('summary')
  getSummary(@Query() query: any) {
    return this.dashboardService.getSummaryDashboard(query);
  }

  @UseGuards(RolesGuard)
  @Roles('admin', 'vu_truong', 'vu_pho')
  @Get('leaderboard')
  getLeaderboard(@Query() query: any) {
    return this.dashboardService.getLeaderboard(query);
  }
}
