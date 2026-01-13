import { dbService } from '../db/database';

export interface Unit {
  id?: number;
  society_id: number;
  unit_number: string;
  wing?: string;
  area_sqft: number;
  owner_name: string;
  contact_number?: string;
  email?: string;
  society_name?: string; // Joined field
}

class UnitService {
  public getAll(): Unit[] {
    return dbService.query<Unit>(`
      SELECT u.*, s.name as society_name 
      FROM units u 
      JOIN societies s ON u.society_id = s.id 
      ORDER BY s.name, u.unit_number ASC
    `);
  }

  public getBySociety(societyId: number): Unit[] {
    return dbService.query<Unit>('SELECT * FROM units WHERE society_id = ? ORDER BY unit_number ASC', [societyId]);
  }

  public create(unit: Unit): number {
    const result = dbService.run(
      `INSERT INTO units (
        society_id, unit_number, wing, area_sqft, owner_name, contact_number, email
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        unit.society_id,
        unit.unit_number,
        unit.wing,
        unit.area_sqft,
        unit.owner_name,
        unit.contact_number,
        unit.email
      ]
    );
    return result.lastInsertRowid as number;
  }

  public update(id: number, unit: Partial<Unit>): boolean {
    const fields = Object.keys(unit)
      .filter(key => key !== 'id' && key !== 'society_name')
      .map(key => `${key} = ?`)
      .join(', ');
    const values = Object.keys(unit)
      .filter(key => key !== 'id' && key !== 'society_name')
      .map(key => unit[key]);

    const result = dbService.run(`UPDATE units SET ${fields} WHERE id = ?`, [...values, id]);
    return result.changes > 0;
  }

  public delete(id: number): boolean {
    const result = dbService.run('DELETE FROM units WHERE id = ?', [id]);
    return result.changes > 0;
  }

  public bulkCreate(units: Unit[]): void {
    dbService.transaction(() => {
      for (const unit of units) {
        this.create(unit);
      }
    });
  }
}

export const unitService = new UnitService();
