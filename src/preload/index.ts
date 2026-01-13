import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  societies: {
    getAll: () => ipcRenderer.invoke('get-societies'),
    getById: (id: number) => ipcRenderer.invoke('get-society', id),
    create: (society: any) => ipcRenderer.invoke('create-society', society),
    update: (id: number, society: any) => ipcRenderer.invoke('update-society', id, society),
    delete: (id: number) => ipcRenderer.invoke('delete-society', id)
  },
  units: {
    getAll: () => ipcRenderer.invoke('get-units'),
    getBySociety: (societyId: number) => ipcRenderer.invoke('get-units-by-society', societyId),
    create: (unit: any) => ipcRenderer.invoke('create-unit', unit),
    update: (id: number, unit: any) => ipcRenderer.invoke('update-unit', id, unit),
    delete: (id: number) => ipcRenderer.invoke('delete-unit', id),
    bulkCreate: (units: any[]) => ipcRenderer.invoke('bulk-create-units', units)
  },
  invoices: {
    getAll: () => ipcRenderer.invoke('get-invoices'),
    createBatch: (societyId: number, month: number, year: number, date: string, dueDate: string) => 
      ipcRenderer.invoke('create-batch-invoices', societyId, month, year, date, dueDate),
    generatePdf: (id: number) => ipcRenderer.invoke('generate-invoice-pdf', id)
  },
  payments: {
    getAll: () => ipcRenderer.invoke('get-payments'),
    create: (payment: any) => ipcRenderer.invoke('create-payment', payment),
    delete: (id: number) => ipcRenderer.invoke('delete-payment', id)
  },
  shell: {
    showItemInFolder: (path: string) => ipcRenderer.invoke('show-item-in-folder', path)
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
