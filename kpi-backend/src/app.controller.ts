import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return 'KPI Backend System - Online';
  }

  @Get('ping')
  getPing(): string {
    return 'pong';
  }
}
