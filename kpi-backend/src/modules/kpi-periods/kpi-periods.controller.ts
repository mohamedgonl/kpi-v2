import { Controller, Get, Post, Body, Patch, Param, UseGuards } from '@nestjs/common';
import { KpiPeriodsService } from './kpi-periods.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@UseGuards(JwtAuthGuard)
@Controller('kpi-periods')
export class KpiPeriodsController {
  constructor(private readonly kpiPeriodsService: KpiPeriodsService) {}

  @Get()
  findAll() {
    return this.kpiPeriodsService.findAll();
  }

  @UseGuards(RolesGuard)
  @Roles('admin')
  @Post()
  create(@Body() createDto: any) {
    return this.kpiPeriodsService.create(createDto);
  }

  @UseGuards(RolesGuard)
  @Roles('admin')
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDto: any) {
    return this.kpiPeriodsService.update(id, updateDto);
  }
}
