import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { Project, Unit, MaintenanceRate, MaintenanceSlab, Payment } from './types'

export * from './types'

// Custom APIs for renderer
const api = {
  projects: {
    getAll: () => ipcRenderer.invoke('get-projects'),
    getById: (id: number) => ipcRenderer.invoke('get-project', id),
    create: (project: Project) => ipcRenderer.invoke('create-project', project),
    update: (id: number, project: Partial<Project>) =>
      ipcRenderer.invoke('update-project', id, project),
    delete: (id: number) => ipcRenderer.invoke('delete-project', id),
    bulkDelete: (ids: number[]) => ipcRenderer.invoke('bulk-delete-projects', ids),
    getDashboardStats: (
      projectId?: number,
      financialYear?: string,
      unitType?: string,
      status?: string
    ) => ipcRenderer.invoke('get-dashboard-stats', projectId, financialYear, unitType, status)
  },
  units: {
    getAll: () => ipcRenderer.invoke('get-units'),
    getByProject: (projectId: number) => ipcRenderer.invoke('get-units-by-project', projectId),
    create: (unit: Unit) => ipcRenderer.invoke('create-unit', unit),
    update: (id: number, unit: Partial<Unit>) => ipcRenderer.invoke('update-unit', id, unit),
    delete: (id: number) => ipcRenderer.invoke('delete-unit', id),
    bulkDelete: (ids: number[]) => ipcRenderer.invoke('bulk-delete-units', ids),
    bulkCreate: (units: Unit[]) => ipcRenderer.invoke('bulk-create-units', units),
    importLedger: (params: { projectId: number; rows: Record<string, unknown>[] }) =>
      ipcRenderer.invoke('import-ledger', params)
  },
  letters: {
    getAll: () => ipcRenderer.invoke('get-letters'),
    getById: (id: number) => ipcRenderer.invoke('get-letter', id),
    createBatch: (params: { projectId: number; financialYear: string; dueDate: string }) =>
      ipcRenderer.invoke('create-batch-letters', params),
    delete: (id: number) => ipcRenderer.invoke('delete-letter', id),
    bulkDelete: (ids: number[]) => ipcRenderer.invoke('bulk-delete-letters', ids),
    generatePdf: (id: number) => ipcRenderer.invoke('generate-letter-pdf', id),
    getAddOns: (id: number) => ipcRenderer.invoke('get-letter-addons', id)
  },
  rates: {
    getAll: () => ipcRenderer.invoke('get-rates'),
    getByProject: (projectId: number) => ipcRenderer.invoke('get-rates-by-project', projectId),
    create: (rate: MaintenanceRate) => ipcRenderer.invoke('create-rate', rate),
    update: (id: number, rate: Partial<MaintenanceRate>) =>
      ipcRenderer.invoke('update-rate', id, rate),
    delete: (id: number) => ipcRenderer.invoke('delete-rate', id),
    getSlabs: (rateId: number) => ipcRenderer.invoke('get-slabs', rateId),
    addSlab: (slab: MaintenanceSlab) => ipcRenderer.invoke('add-slab', slab),
    deleteSlab: (id: number) => ipcRenderer.invoke('delete-slab', id)
  },
  payments: {
    getAll: () => ipcRenderer.invoke('get-payments'),
    create: (payment: Payment) => ipcRenderer.invoke('create-payment', payment),
    delete: (id: number) => ipcRenderer.invoke('delete-payment', id),
    bulkDelete: (ids: number[]) => ipcRenderer.invoke('bulk-delete-payments', ids),
    generateReceiptPdf: (id: number) => ipcRenderer.invoke('generate-receipt-pdf', id)
  },
  shell: {
    showItemInFolder: (path: string) => ipcRenderer.invoke('show-item-in-folder', path)
  },
  database: {
    repair: () => ipcRenderer.invoke('database-repair')
  },
  settings: {
    getAll: () => ipcRenderer.invoke('get-settings'),
    update: (key: string, value: string) => ipcRenderer.invoke('update-setting', key, value),
    delete: (key: string) => ipcRenderer.invoke('delete-setting', key)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
