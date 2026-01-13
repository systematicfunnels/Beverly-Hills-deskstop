import { dbService } from '../db/database';

export interface Society {
  id?: number;
  name: string;
  letterhead_path?: string;
  bank_name?: string;
  account_no?: string;
  ifsc_code?: string;
  qr_code_path?: string;
  base_rate: number;
  tax_percentage: number;
  solar_charges: number;
}

class SocietyService {
  public getAll(): Society[] {
    return dbService.query<Society>('SELECT * FROM societies ORDER BY name ASC');
  }

  public getById(id: number): Society | undefined {
    return dbService.get<Society>('SELECT * FROM societies WHERE id = ?', [id]);
  }

  public create(society: Society): number {
    const result = dbService.run(
      `INSERT INTO societies (
        name, letterhead_path, bank_name, account_no, ifsc_code, qr_code_path, base_rate, tax_percentage, solar_charges
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        society.name,
        society.letterhead_path,
        society.bank_name,
        society.account_no,
        society.ifsc_code,
        society.qr_code_path,
        society.base_rate,
        society.tax_percentage,
        society.solar_charges
      ]
    );
    return result.lastInsertRowid as number;
  }

  public update(id: number, society: Partial<Society>): boolean {
    const fields = Object.keys(society)
      .filter(key => key !== 'id')
      .map(key => `${key} = ?`)
      .join(', ');
    const values = Object.keys(society)
      .filter(key => key !== 'id')
      .map(key => society[key]);

    const result = dbService.run(`UPDATE societies SET ${fields} WHERE id = ?`, [...values, id]);
    return result.changes > 0;
  }

  public delete(id: number): boolean {
    return dbService.transaction(() => {
      // Manual cascade delete for existing databases without ON DELETE CASCADE
      // 1. Delete all payments related to units of this society
      dbService.run(`
        DELETE FROM payments 
        WHERE unit_id IN (SELECT id FROM units WHERE society_id = ?)
      `, [id]);

      // 2. Delete all invoices related to units of this society
      dbService.run(`
        DELETE FROM invoices 
        WHERE unit_id IN (SELECT id FROM units WHERE society_id = ?)
      `, [id]);

      // 3. Delete all units of this society
      dbService.run('DELETE FROM units WHERE society_id = ?', [id]);

      // 4. Finally delete the society
      const result = dbService.run('DELETE FROM societies WHERE id = ?', [id]);
      return result.changes > 0;
    });
  }
}

export const societyService = new SocietyService();
