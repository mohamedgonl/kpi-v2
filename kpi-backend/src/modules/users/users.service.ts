import { Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class UsersService {
  constructor(private readonly db: DatabaseService) {}

  async findAll(queryObj: any) {
    const { search, page = 1, limit = 10, sortBy = 'full_name', sortDesc = 'false' } = queryObj;
    
    let query = `SELECT id, employee_code, full_name, email, phone, position, role, avatar_url, is_active, last_login_at 
                 FROM users WHERE is_active = TRUE`;
    const params: any[] = [];

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (full_name ILIKE $${params.length} 
                   OR email ILIKE $${params.length} 
                   OR employee_code ILIKE $${params.length}
                   OR position ILIKE $${params.length}
                   OR (CASE WHEN role = 'admin' THEN 'Admin' WHEN role = 'vu_truong' THEN 'Vụ trưởng' WHEN role = 'vu_pho' THEN 'Vụ phó' WHEN role = 'chuyen_vien' THEN 'Chuyên viên' ELSE role END) ILIKE $${params.length})`;
    }

    if (queryObj['filters[full_name]']) { params.push(`%${queryObj['filters[full_name]']}%`); query += ` AND full_name ILIKE $${params.length}`; }
    if (queryObj['filters[email]']) { params.push(`%${queryObj['filters[email]']}%`); query += ` AND email ILIKE $${params.length}`; }
    if (queryObj['filters[employee_code]']) { params.push(`%${queryObj['filters[employee_code]']}%`); query += ` AND employee_code ILIKE $${params.length}`; }
    if (queryObj['filters[position]']) { params.push(`%${queryObj['filters[position]']}%`); query += ` AND position ILIKE $${params.length}`; }
    if (queryObj['filters[role]']) { params.push(queryObj['filters[role]']); query += ` AND role = $${params.length}`; }

    // Count before sorting and pagination
    const countQuery = `SELECT COUNT(*) as total FROM (${query}) AS sub`;
    const countRes = await this.db.query(countQuery, params);
    const total = parseInt(countRes.rows[0].total, 10);

    const validSortFields = ['full_name', 'email', 'employee_code', 'position', 'role'];
    const orderField = validSortFields.includes(sortBy) ? sortBy : 'full_name';
    const orderDir = sortDesc === 'true' ? 'DESC' : 'ASC';
    
    query += ` ORDER BY ${orderField} ${orderDir}`;

    const offset = (page - 1) * limit;
    params.push(limit, offset);
    query += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const res = await this.db.query(query, params);
    return { items: res.rows, total };
  }

  async findLeaders() {
    const res = await this.db.query(
      `SELECT id, full_name, position, role 
       FROM users 
       WHERE is_active = TRUE AND role IN ('vu_truong', 'vu_pho') 
       ORDER BY full_name ASC`
    );
    return res.rows;
  }

  async create(createUserDto: any) {
    const { full_name, email, role, phone, position, employee_code } = createUserDto;
    const defaultPassword = await bcrypt.hash('123456', 10);
    
    const res = await this.db.query(
      `INSERT INTO users (full_name, email, role, phone, position, employee_code, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [full_name, email, role || 'chuyen_vien', phone, position, employee_code, defaultPassword]
    );
    return { id: res.rows[0].id, full_name, email, message: 'User created' };
  }

  async update(id: string, updateUserDto: any) {
    const { full_name, role, phone, position, employee_code, is_active } = updateUserDto;
    
    await this.db.query(
      `UPDATE users 
       SET full_name = COALESCE($1, full_name),
           role = COALESCE($2, role),
           phone = COALESCE($3, phone),
           position = COALESCE($4, position),
           employee_code = COALESCE($5, employee_code),
           is_active = COALESCE($6, is_active),
           updated_at = NOW()
       WHERE id = $7`,
      [full_name, role, phone, position, employee_code, is_active, id]
    );
    return { id, message: 'User updated' };
  }

  async softDelete(id: string) {
    await this.db.query(`UPDATE users SET is_active = FALSE WHERE id = $1`, [id]);
    return { id, message: 'User deleted' };
  }

  async resetPassword(id: string) {
    const defaultPassword = await bcrypt.hash('123456', 10);
    await this.db.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [defaultPassword, id]);
    return { id, message: 'Password reset to 123456' };
  }
}
