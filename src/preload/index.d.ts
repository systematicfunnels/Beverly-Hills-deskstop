import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      societies: {
        getAll: () => Promise<any[]>;
        getById: (id: number) => Promise<any>;
        create: (society: any) => Promise<number>;
        update: (id: number, society: any) => Promise<boolean>;
        delete: (id: number) => Promise<boolean>;
      },
      units: {
        getAll: () => Promise<any[]>;
        getBySociety: (societyId: number) => Promise<any[]>;
        create: (unit: any) => Promise<number>;
        update: (id: number, unit: any) => Promise<boolean>;
        delete: (id: number) => Promise<boolean>;
        bulkCreate: (units: any[]) => Promise<void>;
      },
      invoices: {
        getAll: () => Promise<any[]>;
        createBatch: (societyId: number, month: number, year: number, date: string, dueDate: string) => Promise<void>;
        generatePdf: (id: number) => Promise<string>;
      },
      payments: {
        getAll: () => Promise<any[]>;
        create: (payment: any) => Promise<number>;
        delete: (id: number) => Promise<boolean>;
      },
      shell: {
        showItemInFolder: (path: string) => Promise<void>;
      }
    }
  }
}
