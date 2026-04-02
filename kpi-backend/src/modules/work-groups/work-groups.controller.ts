import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { WorkGroupsService } from './work-groups.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@UseGuards(JwtAuthGuard)
@Controller('work-groups')
export class WorkGroupsController {
  constructor(private readonly workGroupsService: WorkGroupsService) {}

  @Get()
  findAll(@Query() query: any) {
    return this.workGroupsService.findAll(query);
  }

  @UseGuards(RolesGuard)
  @Roles('admin')
  @Post()
  create(@Body() createDto: any) {
    return this.workGroupsService.create(createDto);
  }

  @UseGuards(RolesGuard)
  @Roles('admin')
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDto: any) {
    return this.workGroupsService.update(id, updateDto);
  }

  @UseGuards(RolesGuard)
  @Roles('admin')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.workGroupsService.softDelete(id);
  }
}
