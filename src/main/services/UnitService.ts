import { dbService } from '../db/database'

export interface Unit {
  id?: number
  project_id: number
  unit_number: string
  unit_type?: string
  area_sqft: number
  owner_name: string
  contact_number?: string
  email?: string
  status?: string
  project_name?: string // Joined field
}

class UnitService {
  public getAll(): Unit[] {
    return dbService.query<Unit>(`
      SELECT u.*, p.name as project_name 
      FROM units u 
      JOIN projects p ON u.project_id = p.id 
      ORDER BY p.name, u.unit_number ASC
    `)
  }

  public getByProject(projectId: number): Unit[] {
    return dbService.query<Unit>(
      'SELECT * FROM units WHERE project_id = ? ORDER BY unit_number ASC',
      [projectId]
    )
  }

  public create(unit: Unit): number {
    const result = dbService.run(
      `INSERT INTO units (
        project_id, unit_number, unit_type, area_sqft, owner_name, contact_number, email, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        unit.project_id,
        unit.unit_number,
        unit.unit_type || 'Flat',
        unit.area_sqft,
        unit.owner_name,
        unit.contact_number,
        unit.email,
        unit.status || 'Active'
      ]
    )
    return result.lastInsertRowid as number
  }

  public update(id: number, unit: Partial<Unit>): boolean {
    const allowedColumns = [
      'project_id',
      'unit_number',
      'unit_type',
      'area_sqft',
      'owner_name',
      'contact_number',
      'email',
      'status'
    ]
    const keys = Object.keys(unit).filter(
      (key) => allowedColumns.includes(key) && key !== 'id' && key !== 'project_name'
    )

    if (keys.length === 0) return false

    const fields = keys.map((key) => `${key} = ?`).join(', ')
    const values = keys.map((key) => unit[key as keyof Unit])

    const result = dbService.run(`UPDATE units SET ${fields} WHERE id = ?`, [...values, id])
    return result.changes > 0
  }

  public delete(id: number): boolean {
    return dbService.transaction(() => {
      try {
        console.log(`[UNIT_SERVICE] Starting deletion for unit ID: ${id}`)

        // 1. Check if unit exists
        const unit = dbService.get('SELECT id FROM units WHERE id = ?', [id])
        if (!unit) {
          console.warn(`[UNIT_SERVICE] Unit ${id} not found, skipping deletion`)
          return false
        }

        // 2. Delete the unit - let ON DELETE CASCADE handle the rest
        // Tables handled by CASCADE in schema.ts:
        // - maintenance_letters
        // - payments
        // - receipts (via payments)
        // - add_ons (via maintenance_letters)

        const result = dbService.run('DELETE FROM units WHERE id = ?', [id])

        if (result.changes > 0) {
          console.log(
            `[UNIT_SERVICE] Successfully deleted unit ${id} and all related data via cascade.`
          )
          return true
        } else {
          return false
        }
      } catch (error) {
        console.error(`[UNIT_SERVICE] Error deleting unit ${id}:`, error)
        throw error
      }
    })
  }

  /**
   * Complex ledger import that creates Units, Maintenance Letters, and Add-ons in one transaction.
   * Explodes one Excel row into multiple entities.
   */
  public async importLedger(projectId: number, rows: Record<string, unknown>[]): Promise<boolean> {
    console.log(`[IMPORT] Starting ledger import for project ${projectId} with ${rows.length} rows`)

    return dbService.transaction(() => {
      // 1. Ensure project exists
      const project = dbService.get('SELECT id FROM projects WHERE id = ?', [projectId])
      if (!project) throw new Error(`Project ID ${projectId} does not exist`)

      for (const [index, row] of rows.entries()) {
        try {
          // A. Unit Creation/Retrieval
          let unitId: number
          const unitNumber = String(row.unit_number || '').trim()
          if (!unitNumber) continue

          const existingUnit = dbService.get<{ id: number }>(
            'SELECT id FROM units WHERE project_id = ? AND unit_number = ?',
            [projectId, unitNumber]
          )

          if (existingUnit) {
            unitId = existingUnit.id
            // Update owner name if it's different/missing
            if (row.owner_name) {
              dbService.run('UPDATE units SET owner_name = ? WHERE id = ?', [
                row.owner_name as string,
                unitId
              ])
            }
          } else {
            unitId = this.create({
              project_id: projectId,
              unit_number: unitNumber,
              owner_name: (row.owner_name as string) || 'Unknown',
              unit_type: (row.unit_type as string) || 'Bungalow',
              area_sqft: Number(row.area_sqft) || 1000, // Default if missing
              status: 'Active'
            })
          }

          // B. Explode Year Columns into Maintenance Letters
          if (row.years && Array.isArray(row.years)) {
            for (const yearData of row.years) {
              const { financial_year, base_amount, arrears, add_ons } = yearData as {
                financial_year: string
                base_amount: number
                arrears?: number
                add_ons?: { name: string; amount: number }[]
              }

              if (Number(base_amount) <= 0 && (!add_ons || add_ons.length === 0) && !arrears)
                continue

              // Create maintenance letter
              const letterResult = dbService.run(
                `INSERT INTO maintenance_letters (
                  project_id, unit_id, financial_year, base_amount, arrears, final_amount, status, is_paid, is_sent
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  projectId,
                  unitId,
                  financial_year,
                  base_amount,
                  arrears || 0,
                  Number(base_amount) + (arrears || 0), // Initial final_amount, will update with add-ons
                  'Generated', // Aligned with schema default
                  0, // is_paid
                  0 // is_sent
                ]
              )
              const letterId = letterResult.lastInsertRowid as number

              // C. Add-ons
              let totalAddons = 0
              if (add_ons && Array.isArray(add_ons)) {
                for (const addon of add_ons) {
                  const amount = Number(addon.amount)
                  if (amount > 0) {
                    dbService.run(
                      'INSERT INTO add_ons (letter_id, addon_name, addon_amount) VALUES (?, ?, ?)',
                      [letterId, addon.name, amount]
                    )
                    totalAddons += amount
                  }
                }
              }

              // Update final_amount with add-ons
              if (totalAddons > 0) {
                dbService.run(
                  'UPDATE maintenance_letters SET final_amount = final_amount + ? WHERE id = ?',
                  [totalAddons, letterId]
                )
              }
            }
          }
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error)
          console.error(`[IMPORT ERROR] Row ${index} failed:`, message)
          throw new Error(`Row ${index} (${row.unit_number as string}): ${message}`)
        }
      }
      return true
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

  public bulkCreate(units: Unit[]): boolean {
    console.log(`[DEBUG] UnitService.bulkCreate called with ${units.length} units`)

    // Diagnostic: Check if we have any projects at all
    const projectCount = dbService.get<{ count: number }>('SELECT count(*) as count FROM projects')
    console.log(`[DEBUG] Total projects in database: ${projectCount?.count}`)

    return dbService.transaction(() => {
      for (const [index, unit] of units.entries()) {
        try {
          // Ensure project_id is a number
          const projectId = Number(unit.project_id)

          if (isNaN(projectId) || projectId <= 0) {
            throw new Error(`Invalid project_id: ${unit.project_id}`)
          }

          // Verify project exists
          const projectExists = dbService.get('SELECT id FROM projects WHERE id = ?', [projectId])
          if (!projectExists) {
            const allProjects = dbService.query<{ id: number; name: string }>(
              'SELECT id, name FROM projects'
            )
            const availableIds = allProjects.map((p) => p.id).join(', ')
            throw new Error(
              `Project ID ${projectId} does not exist. Available IDs: ${availableIds}`
            )
          }

          // Update unit with numeric project_id
          const unitToCreate = { ...unit, project_id: projectId }

          try {
            this.create(unitToCreate)
          } catch (createError: unknown) {
            const message = createError instanceof Error ? createError.message : String(createError)
            if (message.includes('FOREIGN KEY constraint failed')) {
              // Try to find exactly what failed
              const tableSchema = dbService.get<{ sql: string }>(
                "SELECT sql FROM sqlite_master WHERE type='table' AND name='units'"
              )
              console.error(`[CRITICAL] units table schema:`, tableSchema?.sql)

              const foreignKeyCheck = dbService.query('PRAGMA foreign_key_check(units)')
              console.error(`[CRITICAL] Foreign key check result for units:`, foreignKeyCheck)

              const fkList = dbService.query('PRAGMA foreign_key_list(units)')
              console.error(
                `[CRITICAL] Foreign key list for units:`,
                JSON.stringify(fkList, null, 2)
              )

              const project = dbService.get('SELECT * FROM projects WHERE id = ?', [projectId])
              console.error(`[CRITICAL] Referenced project (${projectId}) state:`, project)
            }
            throw createError
          }
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error)
          console.error(`[ERROR] Failed to create unit at index ${index}:`, unit)
          console.error(`[ERROR] Error details: ${message}`)
          throw error // Re-throw to roll back transaction
        }
      }
      return true
    })
  }
}

export const unitService = new UnitService()
