import { dbService } from '../db/database'

export interface Project {
  id?: number
  name: string
  address?: string
  city?: string
  state?: string
  pincode?: string
  status?: string
  letterhead_path?: string
  bank_name?: string
  account_no?: string
  ifsc_code?: string
  qr_code_path?: string
  created_at?: string
  unit_count?: number
}

class ProjectService {
  public getAll(): Project[] {
    return dbService.query<Project>(`
      SELECT p.*, (SELECT COUNT(*) FROM units u WHERE u.project_id = p.id) as unit_count
      FROM projects p 
      ORDER BY p.name ASC
    `)
  }

  public getById(id: number): Project | undefined {
    return dbService.get<Project>('SELECT * FROM projects WHERE id = ?', [id])
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
    )
    return result.lastInsertRowid as number
  }

  public update(id: number, project: Partial<Project>): boolean {
    const fields = Object.keys(project)
      .filter((key) => key !== 'id' && key !== 'created_at')
      .map((key) => `${key} = ?`)
      .join(', ')
    const values = Object.keys(project)
      .filter((key) => key !== 'id' && key !== 'created_at')
      .map((key) => project[key as keyof Project])

    const result = dbService.run(`UPDATE projects SET ${fields} WHERE id = ?`, [...values, id])
    return result.changes > 0
  }

  public delete(id: number): boolean {
    return dbService.transaction(() => {
      try {
        console.log(`[PROJECT_SERVICE] Starting deletion for project ID: ${id}`)
        
        // 1. Delete the project - let ON DELETE CASCADE handle the rest
        // Tables handled by CASCADE in schema.ts:
        // - units
        // - maintenance_rates
        // - maintenance_letters
        // - payments
        // - receipts (via payments)
        // - add_ons (via maintenance_letters)
        // - maintenance_slabs (via maintenance_rates)
        
        const result = dbService.run('DELETE FROM projects WHERE id = ?', [id])
        
        if (result.changes > 0) {
          console.log(`[PROJECT_SERVICE] Successfully deleted project ${id} and all related data via cascade.`)
          return true
        } else {
          console.warn(`[PROJECT_SERVICE] No project found with ID ${id}.`)
          return false
        }
      } catch (error) {
        console.error(`[PROJECT_SERVICE] Error deleting project ${id}:`, error)
        throw error
      }
    })
  }

  public bulkDelete(ids: number[]): boolean {
    return dbService.transaction(() => {
      let allDeleted = true
      for (const id of ids) {
        if (!this.delete(id)) {
          allDeleted = false
        }
      }
      return allDeleted
    })
  }

  public getDashboardStats(projectId?: number, financialYear?: string, unitType?: string, status?: string): {
    projects: number
    units: number
    pendingUnits: number
    collectedThisYear: number
    totalBilled: number
    totalOutstanding: number
  } {
    // Project filter
    const projectWhere: string[] = []
    const projectParams: any[] = []
    if (projectId) {
      projectWhere.push('id = ?')
      projectParams.push(projectId)
    }
    if (status) {
      projectWhere.push('status = ?')
      projectParams.push(status)
    }
    const projectFilterStr = projectWhere.length > 0 ? `WHERE ${projectWhere.join(' AND ')}` : ''

    // Unit filter
    const unitWhere: string[] = []
    const unitParams: any[] = []
    if (projectId) {
      unitWhere.push('project_id = ?')
      unitParams.push(projectId)
    }
    if (unitType) {
      unitWhere.push('unit_type = ?')
      unitParams.push(unitType)
    }
    if (status) {
      unitWhere.push('project_id IN (SELECT id FROM projects WHERE status = ?)')
      unitParams.push(status)
    }
    const unitFilterStr = unitWhere.length > 0 ? `WHERE ${unitWhere.join(' AND ')}` : ''

    // Letter filter
    const letterWhere: string[] = []
    const letterParams: any[] = []
    if (projectId) {
      letterWhere.push('project_id = ?')
      letterParams.push(projectId)
    }
    if (financialYear) {
      letterWhere.push('financial_year = ?')
      letterParams.push(financialYear)
    }
    if (unitType) {
      letterWhere.push('unit_id IN (SELECT id FROM units WHERE unit_type = ?)')
      letterParams.push(unitType)
    }
    if (status) {
      letterWhere.push('project_id IN (SELECT id FROM projects WHERE status = ?)')
      letterParams.push(status)
    }
    const letterFilterStr = letterWhere.length > 0 ? `WHERE ${letterWhere.join(' AND ')}` : ''

    // Payment filter
    const paymentWhere: string[] = []
    const paymentParams: any[] = []
    if (projectId) {
      paymentWhere.push('project_id = ?')
      paymentParams.push(projectId)
    }
    if (financialYear) {
      paymentWhere.push('financial_year = ?')
      paymentParams.push(financialYear)
    }
    if (unitType) {
      paymentWhere.push('unit_id IN (SELECT id FROM units WHERE unit_type = ?)')
      paymentParams.push(unitType)
    }
    if (status) {
      paymentWhere.push('project_id IN (SELECT id FROM projects WHERE status = ?)')
      paymentParams.push(status)
    }
    const paymentFilterStr = paymentWhere.length > 0 ? `WHERE ${paymentWhere.join(' AND ')}` : ''

    const projectsCount = dbService.get<{ count: number }>(`SELECT COUNT(*) as count FROM projects ${projectFilterStr}`, projectParams)?.count || 0

    const unitsCount = dbService.get<{ count: number }>(`SELECT COUNT(*) as count FROM units ${unitFilterStr}`, unitParams)?.count || 0

    const totalBilled = dbService.get<{ total: number }>(`SELECT SUM(final_amount) as total FROM maintenance_letters ${letterFilterStr}`, letterParams)?.total || 0
    
    const totalCollected = dbService.get<{ total: number }>(`SELECT SUM(payment_amount) as total FROM payments ${paymentFilterStr}`, paymentParams)?.total || 0

    // Calculate collected this year (FY starting April 1st)
    let fiscalYearStart, fiscalYearEnd
    if (financialYear) {
      const startYear = parseInt(financialYear.split('-')[0])
      fiscalYearStart = `${startYear}-04-01`
      fiscalYearEnd = `${startYear + 1}-03-31`
    } else {
      const now = new Date()
      const currentMonth = now.getMonth()
      const fiscalYearStartYear = currentMonth < 3 ? now.getFullYear() - 1 : now.getFullYear()
      fiscalYearStart = `${fiscalYearStartYear}-04-01`
      fiscalYearEnd = `${fiscalYearStartYear + 1}-03-31`
    }

    const collectedThisYearParams: any[] = [fiscalYearStart, fiscalYearEnd]
    let collectedThisYearWhere = 'WHERE (payment_date BETWEEN ? AND ?)'
    
    if (projectId) {
      collectedThisYearWhere += ' AND project_id = ?'
      collectedThisYearParams.push(projectId)
    }
    if (unitType) {
      collectedThisYearWhere += ' AND unit_id IN (SELECT id FROM units WHERE unit_type = ?)'
      collectedThisYearParams.push(unitType)
    }
    if (status) {
      collectedThisYearWhere += ' AND project_id IN (SELECT id FROM projects WHERE status = ?)'
      collectedThisYearParams.push(status)
    }

    const collectedThisYear = dbService.get<{ total: number }>(
      `SELECT SUM(payment_amount) as total FROM payments ${collectedThisYearWhere}`,
      collectedThisYearParams
    )?.total || 0

    // Calculate pending units
    const pendingUnits = dbService.get<{ count: number }>(`
      SELECT COUNT(*) as count FROM (
        SELECT b.unit_id
        FROM (
          SELECT unit_id, SUM(final_amount) as billed FROM maintenance_letters ${letterFilterStr} GROUP BY unit_id
        ) b
        LEFT JOIN (
          SELECT unit_id, SUM(payment_amount) as paid FROM payments ${paymentFilterStr} GROUP BY unit_id
        ) p ON b.unit_id = p.unit_id
        WHERE billed > COALESCE(paid, 0) + 0.01
      )
    `, [...letterParams, ...paymentParams])?.count || 0

    return {
      projects: projectsCount,
      units: unitsCount,
      pendingUnits,
      collectedThisYear,
      totalBilled,
      totalOutstanding: totalBilled - totalCollected
    }
  }
}

export const projectService = new ProjectService()
