<div align="center">

# 🏢 Beverly-Hills-deskstop

> **Professional Desktop Application for Enterprise Data Management**
>
> A powerful Electron-based desktop application built with React and TypeScript for managing business operations, Excel workflows, and database operations across Windows, macOS, and Linux.

[![Electron](https://img.shields.io/badge/Electron-39.2.6-47848F?style=for-the-badge&logo=electron)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-19.2.1-61DAFB?style=for-the-badge&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9.3-3178C6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](#license)

</div>

---

## 📋 Table of Contents

- [About](#about)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Requirements](#requirements)
- [Installation](#installation)
- [Development](#development)
- [Building](#building)
- [Project Structure](#project-structure)
- [Configuration](#configuration)
- [Database](#database)
- [Code Quality](#code-quality)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [Support](#support)

---

## 🎯 About

**Beverly-Hills-deskstop** (internally named **barkat**) is a professional-grade desktop application designed for enterprise data management. It provides a seamless experience for handling complex business operations including:

- 📊 Excel file processing and management
- 💾 Local database operations with SQLite
- 📄 PDF generation and manipulation
- 🌐 Multi-platform support (Windows, macOS, Linux)
- 🔐 Secure local data storage
- ⚡ High-performance desktop operations

Perfect for businesses that need a robust desktop solution without relying on web applications.

---

## ✨ Features

### 📊 Data Management
- ✅ Excel file creation, reading, and modification
- ✅ XLSX format support with advanced formatting
- ✅ Bulk data import/export
- ✅ Data validation and error handling
- ✅ Spreadsheet automation

### 💾 Database Operations
- ✅ Local SQLite database
- ✅ Persistent data storage
- ✅ Fast query execution
- ✅ Data integrity and reliability
- ✅ Database debugging tools included

### 📄 PDF Processing
- ✅ PDF generation from documents
- ✅ PDF manipulation and editing
- ✅ Report generation
- ✅ Multi-page document support

### 🖥️ User Interface
- ✅ Modern, responsive UI with Ant Design
- ✅ Professional component library
- ✅ Icons from Lucide React
- ✅ Intuitive navigation with React Router
- ✅ Cross-platform consistency

### 🔧 Developer Experience
- ✅ Full TypeScript support with strict type checking
- ✅ Hot reload during development
- ✅ Built-in linting with ESLint
- ✅ Code formatting with Prettier
- ✅ Preload scripts for security
- ✅ Electron DevTools included

### 📦 Build & Deployment
- ✅ One-command cross-platform builds
- ✅ Automatic dependency installation
- ✅ Code signing ready
- ✅ Installer generation for all platforms
- ✅ Production-optimized builds

---

## 🛠 Tech Stack

### Core Framework
| Technology | Version | Purpose |
|-----------|---------|---------|
| **Electron** | 39.2.6 | Desktop framework |
| **electron-vite** | 5.0.0 | Build tool |
| **electron-builder** | 26.0.12 | Packaging & distribution |

### Frontend
| Technology | Version | Purpose |
|-----------|---------|---------|
| **React** | 19.2.1 | UI framework |
| **React Router** | 7.12.0 | Navigation & routing |
| **TypeScript** | 5.9.3 | Type-safe development |
| **Vite** | 7.2.6 | Module bundler |
| **Ant Design** | 6.2.0 | UI component library |
| **Lucide React** | 0.562.0 | Icon library |

### Data Management
| Technology | Version | Purpose |
|-----------|---------|---------|
| **better-sqlite3** | 12.6.2 | Embedded database |
| **ExcelJS** | 4.4.0 | Excel file handling |
| **XLSX** | 0.18.5 | Spreadsheet support |
| **pdf-lib** | 1.17.1 | PDF manipulation |

### Development Tools
| Tool | Version | Purpose |
|------|---------|---------|
| **ESLint** | 9.39.1 | Code linting |
| **ESLint React Config** | 7.37.5 | React-specific rules |
| **Prettier** | 3.7.4 | Code formatting |
| **electron-toolkit** | 3.0+ | Electron utilities |

---

## 📋 Requirements

Before you begin, ensure you have the following installed:

- **Node.js**: 18.x or higher
- **npm**: 9.x or higher (comes with Node.js)
- **Git**: Latest version
- **Operating System**: Windows 10+, macOS 10.13+, or Ubuntu 16.04+

### Optional Requirements
- **Code Editor**: VS Code with extensions (ESLint, Prettier)
- **Build Tools**: For native modules compilation

---

## 🚀 Installation

### Step 1: Clone the Repository

```bash
git clone https://github.com/systematicfunnels/Beverly-Hills-deskstop.git
cd Beverly-Hills-deskstop
```

### Step 2: Install Dependencies

```bash
npm install
```

> **Note**: The postinstall script will automatically run `electron-builder install-app-deps` to set up native dependencies.

### Step 3: Verify Installation

```bash
npm run typecheck
```

This will verify that all TypeScript configurations are correct.

---

## 💻 Development

### Start Development Server

```bash
npm run dev
```

This will:
- Start Electron in development mode
- Enable hot reload for React components
- Open DevTools for debugging
- Watch for file changes

### Code Formatting

Auto-format all code:

```bash
npm run format
```

### Linting

Check code quality:

```bash
npm run lint
```

Auto-fix linting issues:

```bash
npm run lint -- --fix
```

### Type Checking

Check TypeScript compilation:

```bash
npm run typecheck
```

Separate type checking:

```bash
# Node side (main process)
npm run typecheck:node

# Web side (renderer process)
npm run typecheck:web
```

### Preview Build

Preview the production build locally:

```bash
npm run start
```

---

## 🔨 Building

### Build for Current Platform

```bash
npm run build
```

This will:
1. Run type checking
2. Build with electron-vite
3. Create the application bundle

### Platform-Specific Builds

#### Build for Windows
```bash
npm run build:win
```

Creates:
- `Beverly-Hills-deskstop Setup x.x.x.exe` (installer)
- Portable executable

#### Build for macOS
```bash
npm run build:mac
```

Creates:
- `Beverly-Hills-deskstop x.x.x.dmg` (disk image)
- `Beverly-Hills-deskstop x.x.x.app` (application bundle)

#### Build for Linux
```bash
npm run build:linux
```

Creates:
- AppImage format
- deb package
- snap package

### Build Without Installation

To build the app without electron-builder:

```bash
npm run build:unpack
```

---

## 📁 Project Structure

```
Beverly-Hills-deskstop/
├── src/
│   ├── main/                    # Main process (Electron)
│   │   ├── index.ts            # Entry point
│   │   └── ...                 # Backend logic
│   └── renderer/                # Renderer process (React)
│       ├── components/         # React components
│       ├── pages/              # Page components
│       ├── App.tsx             # Root component
│       └── main.tsx            # Entry point
├── resources/                   # App resources
│   ├── icon.png                # App icon
│   └── ...
├── build/                       # Build output (after build)
├── out/                         # Electron-vite output
├── docs/                        # Documentation
├── electron.vite.config.ts     # electron-vite configuration
├── electron-builder.yml        # electron-builder configuration
├── tsconfig.json               # TypeScript config (main)
├── tsconfig.web.json           # TypeScript config (renderer)
├── tsconfig.node.json          # TypeScript config (node tools)
├── eslint.config.mjs           # ESLint configuration
├── .prettierrc.yaml            # Prettier configuration
├── .editorconfig               # Editor config
├── vite.config.ts              # Vite configuration
├── package.json                # Dependencies & scripts
└── README.md                   # This file
```

---

## ⚙️ Configuration

### electron-builder Configuration

Main build configuration is in `electron-builder.yml`:

```yaml
appId: com.example.barkat
productName: Beverly-Hills-deskstop
directories:
  output: dist
  buildResources: resources
```

Customize for your distribution needs.

### Electron Vite Configuration

Configure the build process in `electron.vite.config.ts`:

```typescript
export default config({
  main: {
    entry: 'src/main/index.ts'
  },
  preload: {
    entry: 'src/main/preload.ts'
  },
  renderer: {
    root: 'src/renderer'
  }
})
```

### TypeScript Configuration

- `tsconfig.json` - Main configuration
- `tsconfig.web.json` - Renderer process
- `tsconfig.node.json` - Build tools

---

## 💾 Database

### SQLite Setup

The application uses SQLite for local data storage:

```typescript
import Database from 'better-sqlite3';

const db = new Database('barkat.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL
  )
`);
```

### Database File Location

- **Windows**: `C:\Users\YourUser\AppData\Local\barkat\barkat.db`
- **macOS**: `~/Library/Application Support/barkat/barkat.db`
- **Linux**: `~/.config/barkat/barkat.db`

### Debug Database

Use the included debug script:

```bash
node debug_db.js
```

This will:
- Display database structure
- List all tables
- Show table schemas
- Help diagnose database issues

---

## 📊 Excel & Data Operations

### Reading Excel Files

```typescript
import ExcelJS from 'exceljs';

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile('file.xlsx');

workbook.worksheets.forEach(worksheet => {
  worksheet.eachRow((row, rowNumber) => {
    console.log(`Row ${rowNumber}:`, row.values);
  });
});
```

### Creating Excel Files

```typescript
const workbook = new ExcelJS.Workbook();
const worksheet = workbook.addWorksheet('Sheet1');

worksheet.columns = [
  { header: 'Name', key: 'name' },
  { header: 'Email', key: 'email' }
];

worksheet.addRow({ name: 'John', email: 'john@example.com' });

await workbook.xlsx.writeFile('output.xlsx');
```

### Working with XLSX

```typescript
import XLSX from 'xlsx';

const workbook = XLSX.readFile('file.xlsx');
const data = XLSX.utils.sheet_to_json(workbook.Sheets['Sheet1']);
```

---

## 📄 PDF Generation

```typescript
import { PDFDocument } from 'pdf-lib';

const pdfDoc = await PDFDocument.create();
const page = pdfDoc.addPage([600, 400]);

page.drawText('Hello, PDF!', {
  x: 50,
  y: 350,
  size: 25
});

const pdfBytes = await pdfDoc.save();
```

---

## ✅ Code Quality

### Run All Checks

```bash
npm run typecheck && npm run lint && npm run format
```

### Pre-commit Hooks

Set up pre-commit hooks to auto-format and lint:

```bash
# Install husky (if not already installed)
npm install husky --save-dev

# Set up hooks
npx husky install
```

---

## 🔧 Troubleshooting

### Issue: Native Module Compilation Failed

**Solution**: Install build tools for your platform:

**Windows**:
```bash
npm install --global windows-build-tools
```

**macOS**:
```bash
xcode-select --install
```

**Linux**:
```bash
sudo apt-get install build-essential python3
```

### Issue: Electron Not Starting

**Solution**: Clear cache and reinstall:

```bash
rm -rf node_modules
npm install
npm run dev
```

### Issue: Database Lock Error

**Solution**: Ensure only one instance is running:

```bash
# Check running processes
ps aux | grep barkat

# Kill process if necessary
kill -9 <PID>
```

### Issue: Excel File Corruption

**Solution**: Use ExcelJS for reliable file handling:

```bash
npm install exceljs
```

### Issue: Hot Reload Not Working

**Solution**: Check if Vite dev server is running properly:

```bash
npm run dev -- --debug
```

---

## 🤝 Contributing

We welcome contributions! Follow these steps:

### Fork & Clone
```bash
git clone https://github.com/your-username/Beverly-Hills-deskstop.git
cd Beverly-Hills-deskstop
```

### Create Feature Branch
```bash
git checkout -b feature/your-feature-name
```

### Make Changes
- Follow TypeScript strict mode
- Use Prettier for formatting
- Write clean, documented code
- Test your changes thoroughly

### Commit & Push
```bash
git add .
git commit -m "feat: add your feature"
git push origin feature/your-feature-name
```

### Create Pull Request
1. Go to GitHub repository
2. Click "New Pull Request"
3. Describe your changes
4. Wait for review

---

## 📝 License

This project is currently **unlicensed**. 

> **Note**: Before using this project commercially or distributing it, please clarify the licensing terms with the repository owner.

---

## 📞 Support

### Report Issues
- 🐛 [Open a GitHub Issue](https://github.com/systematicfunnels/Beverly-Hills-deskstop/issues)
- Provide detailed error messages
- Include OS and version information
- Attach relevant log files

### Get Help
- 📖 [Check Documentation](./docs)
- 💬 [Start a Discussion](https://github.com/systematicfunnels/Beverly-Hills-deskstop/discussions)
- 🔍 Check existing issues for solutions

### Contact
- **Repository**: https://github.com/systematicfunnels/Beverly-Hills-deskstop
- **Owner**: [@systematicfunnels](https://github.com/systematicfunnels)

---

## 📚 Resources

### Framework Documentation
- [Electron Documentation](https://www.electronjs.org/docs)
- [electron-vite Guide](https://electron-vite.org/)
- [React Documentation](https://react.dev)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

### Component Libraries
- [Ant Design Components](https://ant.design/components/overview/)
- [Lucide Icons](https://lucide.dev/)
- [React Router Docs](https://reactrouter.com/)

### Data Management
- [ExcelJS Documentation](https://github.com/exceljs/exceljs)
- [better-sqlite3 Guide](https://github.com/WiseLibs/better-sqlite3)
- [pdf-lib Documentation](https://pdf-lib.js.org/)

### Build & Deployment
- [electron-builder Guide](https://www.electron.build/)
- [Vite Documentation](https://vitejs.dev/)
- [ESLint Configuration](https://eslint.org/docs/latest/use/configure/)

---

## 🚀 Quick Start Checklist

- [ ] Clone the repository
- [ ] Install Node.js 18+
- [ ] Run `npm install`
- [ ] Run `npm run dev` to start development
- [ ] Make changes to `src/renderer/` or `src/main/`
- [ ] Test the application
- [ ] Run `npm run lint` to check code quality
- [ ] Run `npm run build:win` (or `build:mac`/`build:linux`)
- [ ] Find installer in `dist/` folder

---

## 📊 Project Stats

- **Language**: TypeScript
- **Framework**: Electron + React
- **Database**: SQLite
- **Build Tool**: electron-vite
- **Platform Support**: Windows, macOS, Linux
- **Code Quality**: ESLint + Prettier
- **Type Safety**: Full TypeScript

---

<div align="center">

## Made with ❤️ by systematicfunnels

**[⭐ Star on GitHub](https://github.com/systematicfunnels/Beverly-Hills-deskstop)** • **[🐛 Report Issues](https://github.com/systematicfunnels/Beverly-Hills-deskstop/issues)** • **[💬 Discussions](https://github.com/systematicfunnels/Beverly-Hills-deskstop/discussions)**

Questions? Open an issue or start a discussion!

</div>
