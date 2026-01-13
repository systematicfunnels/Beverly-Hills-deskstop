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
    return dbService.transaction(() => {
      try {
        console.log(`[DEBUG] Starting thorough deletion of unit ${id}`);
        
        // 0. Check if unit exists
        const unit = dbService.get('SELECT id FROM units WHERE id = ?', [id]);
        if (!unit) {
          console.warn(`[DEBUG] Unit ${id} not found, skipping deletion`);
          return false;
        }

        // 1. Clear invoice references in ANY payment (even from other units) 
        // that points to this unit's invoices
        console.log(`[DEBUG] Step 1: Clearing all payment references to invoices of unit ${id}`);
        dbService.run(`
          UPDATE payments 
          SET invoice_id = NULL 
          WHERE invoice_id IN (SELECT id FROM invoices WHERE unit_id = ?)
        `, [id]);
        
        // 2. Delete all payments belonging to this unit
        console.log(`[DEBUG] Step 2: Deleting all payments belonging to unit ${id}`);
        dbService.run('DELETE FROM payments WHERE unit_id = ?', [id]);
        
        // 3. Delete all invoices belonging to this unit
        console.log(`[DEBUG] Step 3: Deleting all invoices belonging to unit ${id}`);
        dbService.run('DELETE FROM invoices WHERE unit_id = ?', [id]);
        
        // 4. Finally delete the unit
        console.log(`[DEBUG] Step 4: Deleting unit record for ${id}`);
        const result = dbService.run('DELETE FROM units WHERE id = ?', [id]);
        
        console.log(`[DEBUG] Unit ${id} and all related data deleted successfully`);
        return result.changes > 0;
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
