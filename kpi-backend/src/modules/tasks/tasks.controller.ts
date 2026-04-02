import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { KpiCalculatorService } from './kpi-calculator.service';

@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly kpiCalculatorService: KpiCalculatorService
  ) {}

  @Get()
  findAll(
    @Query('start_date') startDate: string,
    @Query('end_date') endDate: string,
    @Query('user_id') queryUserId: string,
    @Query('search') search: string,
    @CurrentUser() user: any
  ) {
    const targetUserId = (user.role === 'chuyen_vien') ? user.id : (queryUserId || user.id);
    return this.tasksService.findAll(targetUserId, startDate, endDate, search);
  }

  @Post()
  create(@Body() createDto: any, @CurrentUser() user: any) {
    return this.tasksService.create(user.id, createDto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDto: any, @CurrentUser() user: any) {
    return this.tasksService.update(user.id, id, updateDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.tasksService.delete(user.id, id);
  }

  // Preview API endpoint to test the Kpi Calculator without saving to DB
  @Post('preview-score')
  previewScore(@Body() tasksData: any[]) {
    return this.kpiCalculatorService.computeKpiBreakdown(tasksData);
  }
}
