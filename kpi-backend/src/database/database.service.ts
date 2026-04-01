import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly pool: Pool;

  constructor(private readonly configService: ConfigService) {
    this.pool = new Pool({
      connectionString: this.configService.get<string>('DATABASE_URL'),
      ssl: {
        rejectUnauthorized: false
      }
    });
  }

  async onModuleInit() {
    const url = this.configService.get<string>('DATABASE_URL');
    if (!url) {
      console.error('DATABASE_URL is not defined in environment variables');
      return;
    }

    // Mask credentials for logging
    const maskedUrl = url.replace(/:\/\/.*@/, '://****:****@');
    console.log(`Connecting to database: ${maskedUrl}`);

    try {
      // Create a test client to verify connection
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
      console.log('Database connection established successfully');
    } catch (error) {
      console.error('Database connection failed (CRITICAL):', error.message);
      if (error.message.includes('Tenant or user not found')) {
        console.error('HINT: Check your Supabase Project ID in DATABASE_URL. The username "postgres.[PROJECT_ID]" must match your project.');
      }
      // Do not throw error here to allow app to start even with DB issues
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  async query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, params);
  }

  async getClient(): Promise<PoolClient> {
    const client = await this.pool.connect();
    return client;
  }
}
