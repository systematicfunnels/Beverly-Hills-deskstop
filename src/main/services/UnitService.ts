import { dbService } from '../db/database';

export interface Unit {
  id?: number;
  project_id: number;
  unit_number: string;
  unit_type?: string;
  wing?: string;
  area_sqft: number;
  owner_name: string;
  contact_number?: string;
  email?: string;
  status?: string;
  project_name?: string; // Joined field
}

class UnitService {
  public getAll(): Unit[] {
    return dbService.query<Unit>(`
      SELECT u.*, p.name as project_name 
      FROM units u 
      JOIN projects p ON u.project_id = p.id 
      ORDER BY p.name, u.unit_number ASC
    `);
  }

  public getByProject(projectId: number): Unit[] {
    return dbService.query<Unit>('SELECT * FROM units WHERE project_id = ? ORDER BY unit_number ASC', [projectId]);
  }

  public create(unit: Unit): number {
    const result = dbService.run(
      `INSERT INTO units (
        project_id, unit_number, unit_type, wing, area_sqft, owner_name, contact_number, email, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        unit.project_id,
        unit.unit_number,
        unit.unit_type || 'Flat',
        unit.wing,
        unit.area_sqft,
        unit.owner_name,
        unit.contact_number,
        unit.email,
        unit.status || 'Active'
      ]
    );
    return result.lastInsertRowid as number;
  }

  public update(id: number, unit: Partial<Unit>): boolean {
    const fields = Object.keys(unit)
      .filter(key => key !== 'id' && key !== 'project_name')
      .map(key => `${key} = ?`)
      .join(', ');
    const values = Object.keys(unit)
      .filter(key => key !== 'id' && key !== 'project_name')
      .map(key => unit[key as keyof Unit]);

    const result = dbService.run(`UPDATE units SET ${fields} WHERE id = ?`, [...values, id]);
    return result.changes > 0;
  }

  public delete(id: number): boolean {
    return dbService.transaction(() => {
      try {
        console.log(`[DEBUG] Starting thorough deletion of unit ${id}`);
        
        // 0. Check if unit exists
        const unit = dbService.get('SELECT id FROM units WHERE id = ?', [id]);
        if (!unit) {
          console.warn(`[DEBUG] Unit ${id} not found, skipping deletion`);
          return false;
        }

        // 1. Clear letter references in ANY payment (even from other units) 
        // that points to this unit's letters
        console.log(`[DEBUG] Step 1: Clearing all payment references to letters of unit ${id}`);
        try {
          dbService.run(`
            UPDATE payments 
            SET letter_id = NULL 
            WHERE letter_id IN (SELECT id FROM maintenance_letters WHERE unit_id = ?)
          `, [id]);
        } catch (e) {
          console.error(`[ERROR] Step 1 failed for unit ${id}:`, e);
          throw e;
        }
        
        // 2. Delete all payments belonging to this unit
        console.log(`[DEBUG] Step 2: Deleting all payments belonging to unit ${id}`);
        try {
          dbService.run('DELETE FROM payments WHERE unit_id = ?', [id]);
        } catch (e) {
          console.error(`[ERROR] Step 2 failed for unit ${id}:`, e);
          throw e;
        }
        
        // 3. Delete all maintenance letters belonging to this unit
        console.log(`[DEBUG] Step 3: Deleting all maintenance letters belonging to unit ${id}`);
        try {
          dbService.run('DELETE FROM maintenance_letters WHERE unit_id = ?', [id]);
        } catch (e) {
          console.error(`[ERROR] Step 3 failed for unit ${id}:`, e);
          throw e;
        }
        
        // 4. Finally delete the unit
        console.log(`[DEBUG] Step 4: Deleting unit record for ${id}`);
        try {
          const result = dbService.run('DELETE FROM units WHERE id = ?', [id]);
          console.log(`[DEBUG] Unit ${id} and all related data deleted successfully`);
          return result.changes > 0;
        } catch (e) {
          console.error(`[ERROR] Step 4 failed for unit ${id}:`, e);
          throw e;
        }
      } catch (error) {
        console.error(`[FATAL] Error in thorough UnitService.delete(${id}):`, error);
        // If it still fails, let's see which table is causing it via foreign_key_check
        try {
          const violations = dbService.query('PRAGMA foreign_key_check');
          if (violations.length > 0) {
            console.error('[DEBUG] Foreign key violations detected:', JSON.stringify(violations, null, 2));
          }
        } catch (e) {
          // ignore
        }
        throw error;
      }
    });
  }

  public bulkDelete(ids: number[]): void {
    dbService.transaction(() => {
      for (const id of ids) {
        this.delete(id);
      }
    });
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
