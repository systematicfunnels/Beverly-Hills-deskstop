import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  projects: {
    getAll: () => ipcRenderer.invoke('get-projects'),
    getById: (id: number) => ipcRenderer.invoke('get-project', id),
    create: (project: any) => ipcRenderer.invoke('create-project', project),
    update: (id: number, project: any) => ipcRenderer.invoke('update-project', id, project),
    delete: (id: number) => ipcRenderer.invoke('delete-project', id),
    bulkDelete: (ids: number[]) => ipcRenderer.invoke('bulk-delete-projects', ids)
  },
  units: {
    getAll: () => ipcRenderer.invoke('get-units'),
    getByProject: (projectId: number) => ipcRenderer.invoke('get-units-by-project', projectId),
    create: (unit: any) => ipcRenderer.invoke('create-unit', unit),
    update: (id: number, unit: any) => ipcRenderer.invoke('update-unit', id, unit),
    delete: (id: number) => ipcRenderer.invoke('delete-unit', id),
    bulkDelete: (ids: number[]) => ipcRenderer.invoke('bulk-delete-units', ids),
    bulkCreate: (units: any[]) => ipcRenderer.invoke('bulk-create-units', units)
  },
  letters: {
    getAll: () => ipcRenderer.invoke('get-letters'),
    getById: (id: number) => ipcRenderer.invoke('get-letter', id),
    createBatch: (params: any) => ipcRenderer.invoke('create-batch-letters', params),
    delete: (id: number) => ipcRenderer.invoke('delete-letter', id),
    bulkDelete: (ids: number[]) => ipcRenderer.invoke('bulk-delete-letters', ids),
    generatePdf: (id: number) => ipcRenderer.invoke('generate-letter-pdf', id)
  },
  rates: {
    getAll: () => ipcRenderer.invoke('get-rates'),
    getByProject: (projectId: number) => ipcRenderer.invoke('get-rates-by-project', projectId),
    create: (rate: any) => ipcRenderer.invoke('create-rate', rate),
    update: (id: number, rate: any) => ipcRenderer.invoke('update-rate', id, rate),
    delete: (id: number) => ipcRenderer.invoke('delete-rate', id),
    getSlabs: (rateId: number) => ipcRenderer.invoke('get-slabs', rateId),
    addSlab: (slab: any) => ipcRenderer.invoke('add-slab', slab),
    deleteSlab: (id: number) => ipcRenderer.invoke('delete-slab', id)
  },
  payments: {
    getAll: () => ipcRenderer.invoke('get-payments'),
    create: (payment: any) => ipcRenderer.invoke('create-payment', payment),
    delete: (id: number) => ipcRenderer.invoke('delete-payment', id),
    bulkDelete: (ids: number[]) => ipcRenderer.invoke('bulk-delete-payments', ids),
    generateReceiptPdf: (id: number) => ipcRenderer.invoke('generate-receipt-pdf', id)
  },
  shell: {
    showItemInFolder: (path: string) => ipcRenderer.invoke('show-item-in-folder', path)
  },
  database: {
    repair: () => ipcRenderer.invoke('database-repair')
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
