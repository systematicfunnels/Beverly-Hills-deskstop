import { dbService } from '../db/database';

export interface Project {
  id?: number;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  status?: string;
  letterhead_path?: string;
  bank_name?: string;
  account_no?: string;
  ifsc_code?: string;
  qr_code_path?: string;
  created_at?: string;
}

class ProjectService {
  public getAll(): Project[] {
    return dbService.query<Project>('SELECT * FROM projects ORDER BY name ASC');
  }

  public getById(id: number): Project | undefined {
    return dbService.get<Project>('SELECT * FROM projects WHERE id = ?', [id]);
  }

  public create(project: Project): number {
    const result = dbService.run(
      `INSERT INTO projects (
        name, address, city, state, pincode, status, letterhead_path, bank_name, account_no, ifsc_code, qr_code_path
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        project.name,
        project.address,
        project.city,
        project.state,
        project.pincode,
        project.status || 'Active',
        project.letterhead_path,
        project.bank_name,
        project.account_no,
        project.ifsc_code,
        project.qr_code_path
      ]
    );
    return result.lastInsertRowid as number;
  }

  public update(id: number, project: Partial<Project>): boolean {
    const fields = Object.keys(project)
      .filter(key => key !== 'id' && key !== 'created_at')
      .map(key => `${key} = ?`)
      .join(', ');
    const values = Object.keys(project)
      .filter(key => key !== 'id' && key !== 'created_at')
      .map(key => project[key as keyof Project]);

    const result = dbService.run(`UPDATE projects SET ${fields} WHERE id = ?`, [...values, id]);
    return result.changes > 0;
  }

  public delete(id: number): boolean {
    return dbService.transaction(() => {
      try {
        // 0. Clear letter references in payments for this project's units
        dbService.run(`
          UPDATE payments 
          SET letter_id = NULL 
          WHERE letter_id IN (
            SELECT id FROM maintenance_letters 
            WHERE project_id = ?
          )
        `, [id]);

        // 1. Delete all receipts for payments of this project
        dbService.run(`
          DELETE FROM receipts 
          WHERE payment_id IN (
            SELECT id FROM payments WHERE project_id = ?
          )
        `, [id]);

        // 2. Delete all payments related to this project
        dbService.run(`
          DELETE FROM payments 
          WHERE project_id = ?
        `, [id]);

        // 3. Delete all add-ons for letters of this project
        dbService.run(`
          DELETE FROM add_ons 
          WHERE letter_id IN (
            SELECT id FROM maintenance_letters WHERE project_id = ?
          )
        `, [id]);

        // 4. Delete all maintenance letters related to this project
        dbService.run(`
          DELETE FROM maintenance_letters 
          WHERE project_id = ?
        `, [id]);

        // 5. Delete all units of this project
        dbService.run('DELETE FROM units WHERE project_id = ?', [id]);

        // 6. Delete all maintenance slabs related to rates of this project
        dbService.run(`
          DELETE FROM maintenance_slabs 
          WHERE rate_id IN (
            SELECT id FROM maintenance_rates WHERE project_id = ?
          )
        `, [id]);

        // 7. Delete all maintenance rates related to this project
        dbService.run('DELETE FROM maintenance_rates WHERE project_id = ?', [id]);

        // 8. Finally delete the project
        const result = dbService.run('DELETE FROM projects WHERE id = ?', [id]);
        return result.changes > 0;
      } catch (error) {
        console.error(`Error deleting project ${id}:`, error);
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
}

export const projectService = new ProjectService();
