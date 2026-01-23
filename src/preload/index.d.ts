import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      projects: {
        getAll: () => Promise<any[]>;
        getById: (id: number) => Promise<any>;
        create: (project: any) => Promise<number>;
        update: (id: number, project: any) => Promise<boolean>;
        delete: (id: number) => Promise<boolean>;
        bulkDelete: (ids: number[]) => Promise<void>;
      },
      units: {
        getAll: () => Promise<any[]>;
        getByProject: (projectId: number) => Promise<any[]>;
        create: (unit: any) => Promise<number>;
        update: (id: number, unit: any) => Promise<boolean>;
        delete: (id: number) => Promise<boolean>;
        bulkDelete: (ids: number[]) => Promise<void>;
        bulkCreate: (units: any[]) => Promise<void>;
      },
      letters: {
        getAll: () => Promise<any[]>;
        getById: (id: number) => Promise<any>;
        createBatch: (params: {
          projectId: number;
          financialYear: string;
          letterDate: string;
          dueDate: string;
          addOns: any[];
        }) => Promise<void>;
        delete: (id: number) => Promise<boolean>;
        bulkDelete: (ids: number[]) => Promise<void>;
        generatePdf: (id: number) => Promise<string>;
      },
      rates: {
        getAll: () => Promise<any[]>;
        getByProject: (projectId: number) => Promise<any[]>;
        create: (rate: any) => Promise<number>;
        update: (id: number, rate: any) => Promise<boolean>;
        delete: (id: number) => Promise<boolean>;
        getSlabs: (rateId: number) => Promise<any[]>;
        addSlab: (slab: any) => Promise<number>;
        deleteSlab: (id: number) => Promise<boolean>;
      },
      payments: {
        getAll: () => Promise<any[]>;
        create: (payment: any) => Promise<number>;
        delete: (id: number) => Promise<boolean>;
        bulkDelete: (ids: number[]) => Promise<void>;
        generateReceiptPdf: (id: number) => Promise<string>;
      },
      shell: {
        showItemInFolder: (path: string) => Promise<void>;
      },
      database: {
        repair: () => Promise<any>;
      }
    }
  }
}
