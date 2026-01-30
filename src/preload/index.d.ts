import { ElectronAPI } from '@electron-toolkit/preload'
import {
  Project,
  Unit,
  MaintenanceLetter,
  MaintenanceRate,
  MaintenanceSlab,
  Payment,
  RepairResult,
  LetterAddOn
} from './types'

export * from './types'

declare global {
  interface Window {
    Buffer: typeof Buffer
    electron: ElectronAPI
    api: {
      projects: {
        getAll: () => Promise<Project[]>
        getById: (id: number) => Promise<Project | undefined>
        create: (project: Project) => Promise<number>
        update: (id: number, project: Partial<Project>) => Promise<boolean>
        delete: (id: number) => Promise<boolean>
        bulkDelete: (ids: number[]) => Promise<boolean>
        getDashboardStats: (
          projectId?: number,
          financialYear?: string,
          unitType?: string,
          status?: string
        ) => Promise<{
          projects: number
          units: number
          pendingUnits: number
          collectedThisYear: number
          totalBilled: number
          totalOutstanding: number
        }>
      }
      units: {
        getAll: () => Promise<Unit[]>
        getByProject: (projectId: number) => Promise<Unit[]>
        create: (unit: Unit) => Promise<number>
        update: (id: number, unit: Partial<Unit>) => Promise<boolean>
        delete: (id: number) => Promise<boolean>
        bulkDelete: (ids: number[]) => Promise<boolean>
        bulkCreate: (units: Unit[]) => Promise<boolean>
        importLedger: (params: {
          projectId: number
          rows: Record<string, unknown>[]
        }) => Promise<boolean>
      }
      letters: {
        getAll: () => Promise<MaintenanceLetter[]>
        getById: (id: number) => Promise<MaintenanceLetter | undefined>
        createBatch: (params: {
          projectId: number
          financialYear: string
          letterDate: string
          dueDate: string
          addOns: { name: string; amount: number }[]
        }) => Promise<boolean>
        delete: (id: number) => Promise<boolean>
        bulkDelete: (ids: number[]) => Promise<boolean>
        generatePdf: (id: number) => Promise<string>
        getAddOns: (id: number) => Promise<LetterAddOn[]>
      }
      rates: {
        getAll: () => Promise<MaintenanceRate[]>
        getByProject: (projectId: number) => Promise<MaintenanceRate[]>
        create: (rate: MaintenanceRate) => Promise<number>
        update: (id: number, rate: Partial<MaintenanceRate>) => Promise<boolean>
        delete: (id: number) => Promise<boolean>
        getSlabs: (rateId: number) => Promise<MaintenanceSlab[]>
        addSlab: (slab: MaintenanceSlab) => Promise<number>
        deleteSlab: (id: number) => Promise<boolean>
      }
      payments: {
        getAll: () => Promise<Payment[]>
        create: (payment: Payment) => Promise<number>
        delete: (id: number) => Promise<boolean>
        bulkDelete: (ids: number[]) => Promise<boolean>
        generateReceiptPdf: (id: number) => Promise<string>
      }
      shell: {
        showItemInFolder: (path: string) => void
      }
      database: {
        repair: () => Promise<RepairResult>
      }
      settings: {
        getAll: () => Promise<Record<string, unknown>[]>
        update: (key: string, value: string) => Promise<Record<string, unknown>>
        delete: (key: string) => Promise<Record<string, unknown>>
      }
    }
  }
}
