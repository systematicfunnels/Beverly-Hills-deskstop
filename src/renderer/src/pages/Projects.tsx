import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  message,
  Upload,
  Card,
  Select,
  Tag,
  Tooltip,
  Typography,
  Tabs,
  List,
  Alert
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  UploadOutlined,
  SearchOutlined,
  BankOutlined,
  FolderOpenOutlined,
  CheckCircleOutlined,
  WarningOutlined
} from '@ant-design/icons'
import {
  Project,
  ProjectSectorPaymentConfig,
  ProjectSetupSummary,
  StandardWorkbookProjectImportResult
} from '@preload/types'
import { readExcelWorkbook } from '../utils/excelReader'
import MaintenanceRateModal from '../components/MaintenanceRateModal'
import { parseStandardWorkbook, StandardWorkbookParseResult } from '../utils/standardWorkbook'

const { Option } = Select
const { TabPane } = Tabs
const { Text, Paragraph } = Typography

const getDefaultSectorConfigs = (): Partial<ProjectSectorPaymentConfig>[] => [
  { sector_code: 'A' },
  { sector_code: 'B' },
  { sector_code: 'C' }
]

const DEFAULT_PROJECT_FORM_VALUES: Partial<Project> = {
  status: 'Active',
  city: 'Ahmedabad',
  template_type: 'standard',
  import_profile_key: 'standard_normalized'
}

const TEMPLATE_OPTIONS = [
  {
    value: 'standard',
    label: 'Standard Letter',
    description: 'Default platform maintenance letter flow.'
  },
  {
    value: 'sector_legacy',
    label: 'Sector Legacy',
    description: 'For sector-driven legacy projects with bank routing by sector.'
  },
  {
    value: 'reminder_legacy',
    label: 'Reminder Legacy',
    description: 'For reminder-style historical ledgers and follow-up letters.'
  }
]

const IMPORT_PROFILE_OPTIONS = [
  {
    value: 'standard_normalized',
    label: 'Standard Platform Sheet',
    description: 'Normalized workbook for future platform-led operations.'
  },
  {
    value: 'beverly_abc_v1',
    label: 'Beverly A/B/C Legacy',
    description: 'Wide-format workbook with A/B/C plot blocks and year columns.'
  },
  {
    value: 'banjara_numeric_v1',
    label: 'Banjara Sector Ledger',
    description: 'Sector + plot workbook with GST and pipe replacement columns.'
  }
]

const TEMPLATE_LABELS = Object.fromEntries(TEMPLATE_OPTIONS.map((option) => [option.value, option.label]))
const IMPORT_PROFILE_LABELS = Object.fromEntries(
  IMPORT_PROFILE_OPTIONS.map((option) => [option.value, option.label])
)

const Projects: React.FC = () => {
  const currentYear = new Date().getMonth() < 3 ? new Date().getFullYear() - 1 : new Date().getFullYear()
  const currentFY = `${currentYear}-${String(currentYear + 1).slice(2)}`
  const [projects, setProjects] = useState<Project[]>([])
  const [projectSetupSummaries, setProjectSetupSummaries] = useState<Record<number, ProjectSetupSummary>>(
    {}
  )
  const [loading, setLoading] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isRateModalOpen, setIsRateModalOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])

  // Filter states
  const [searchText, setSearchText] = useState('')
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [cityFilter, setCityFilter] = useState<string | null>(null)

  const [standardWorkbookPreview, setStandardWorkbookPreview] = useState<StandardWorkbookParseResult | null>(
    null
  )
  const [isWorkbookPreviewOpen, setIsWorkbookPreviewOpen] = useState(false)
  const [isWorkbookImporting, setIsWorkbookImporting] = useState(false)
  const [workbookFileName, setWorkbookFileName] = useState('')
  const [importResults, setImportResults] = useState<StandardWorkbookProjectImportResult[]>([])
  const [showImportSummary, setShowImportSummary] = useState(false)
  const [sectorConfigs, setSectorConfigs] = useState<Partial<ProjectSectorPaymentConfig>[]>(
    getDefaultSectorConfigs()
  )

  const [form] = Form.useForm()
  const location = useLocation()

  const fetchProjects = async (): Promise<void> => {
    setLoading(true)
    try {
      const [data, summaries] = await Promise.all([
        window.api.projects.getAll(),
        window.api.projects.getSetupSummaries(currentFY)
      ])
      setProjects(data)
      setProjectSetupSummaries(
        Object.fromEntries(summaries.map((summary) => [summary.project_id, summary]))
      )
    } catch (error) {
      message.error('Failed to fetch projects')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProjects()
  }, [])

  useEffect(() => {
    const state = location.state as { openRatesProjectId?: number; openEditProjectId?: number } | null
    const targetEditProjectId = state?.openEditProjectId
    if (targetEditProjectId) {
      const projectToEdit = projects.find((x) => x.id === targetEditProjectId)
      if (projectToEdit) {
        void handleEdit(projectToEdit)
        window.history.replaceState({}, document.title)
      }
      return
    }

    const targetProjectId = state?.openRatesProjectId
    if (!targetProjectId) return

    const p = projects.find((x) => x.id === targetProjectId)
    if (!p) return

    setSelectedProject(p)
    setIsRateModalOpen(true)
    window.history.replaceState({}, document.title)
  }, [location, projects])

  // Get unique cities for filter
  const uniqueCities = useMemo(() => {
    return Array.from(new Set(projects.map((p) => p.city).filter(Boolean))).sort()
  }, [projects])

  const existingProjectNameSet = useMemo(() => {
    return new Set(projects.map((project) => project.name.trim().toLowerCase()))
  }, [projects])

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return searchText || statusFilter || cityFilter
  }, [searchText, statusFilter, cityFilter])

  // Clear all filters
  const clearAllFilters = useCallback(() => {
    setSearchText('')
    setStatusFilter(null)
    setCityFilter(null)
  }, [])

  // Filtered data
  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      const matchesSearch =
        !searchText ||
        (p.project_code || '').toLowerCase().includes(searchText.toLowerCase()) ||
        p.name.toLowerCase().includes(searchText.toLowerCase()) ||
        p.address?.toLowerCase().includes(searchText.toLowerCase()) ||
        p.city?.toLowerCase().includes(searchText.toLowerCase())
      const projectStatus = p.status || 'Inactive'
      const matchesStatus = !statusFilter || projectStatus === statusFilter
      const matchesCity = !cityFilter || p.city === cityFilter
      return matchesSearch && matchesStatus && matchesCity
    })
  }, [projects, searchText, statusFilter, cityFilter])

  // Get selected projects for bulk delete preview
  const selectedProjects = useMemo(() => {
    return projects.filter((p) => selectedRowKeys.includes(p.id!))
  }, [projects, selectedRowKeys])

  const editingProjectSummary = useMemo(() => {
    if (!editingProject?.id) return null
    return projectSetupSummaries[editingProject.id] || null
  }, [editingProject, projectSetupSummaries])

  const handleAdd = (): void => {
    setEditingProject(null)
    form.resetFields()
    form.setFieldsValue(DEFAULT_PROJECT_FORM_VALUES)
    setSectorConfigs(getDefaultSectorConfigs())
    setIsModalOpen(true)
  }

  const pickProjectFile = async (
    field: 'letterhead_path' | 'qr_code_path',
    title: string
  ): Promise<void> => {
    try {
      const selectedPath = await window.api.dialog.selectFile({
        title,
        filters: [
          {
            name: 'Image Files',
            extensions: ['png', 'jpg', 'jpeg']
          }
        ]
      })

      if (selectedPath) {
        form.setFieldsValue({ [field]: selectedPath })
      }
    } catch (error) {
      console.error('Failed to pick file:', error)
      message.error('Failed to open file picker')
    }
  }

  const pickSectorQrFile = async (index: number): Promise<void> => {
    try {
      const selectedPath = await window.api.dialog.selectFile({
        title: 'Select Sector QR / Barcode Image',
        filters: [
          {
            name: 'Image Files',
            extensions: ['png', 'jpg', 'jpeg']
          }
        ]
      })

      if (selectedPath) {
        handleSectorConfigChange(index, 'qr_code_path', selectedPath)
      }
    } catch (error) {
      console.error('Failed to pick sector QR file:', error)
      message.error('Failed to open file picker')
    }
  }

  const handleSectorConfigChange = (
    index: number,
    key: keyof ProjectSectorPaymentConfig,
    value: string
  ): void => {
    setSectorConfigs((prev) =>
      prev.map((item, itemIndex) => {
        if (itemIndex !== index) return item
        return {
          ...item,
          [key]: key === 'sector_code' ? value.toUpperCase() : value
        }
      })
    )
  }

  const handleAddSectorConfigRow = (): void => {
    setSectorConfigs((prev) => [...prev, { sector_code: '' }])
  }

  const handleRemoveSectorConfigRow = (index: number): void => {
    setSectorConfigs((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
  }

  const closeWorkbookPreview = (force: boolean = false): void => {
    if (isWorkbookImporting && !force) return
    setIsWorkbookPreviewOpen(false)
    setStandardWorkbookPreview(null)
    setWorkbookFileName('')
  }

  const handleStandardWorkbookImport = async (file: File): Promise<boolean> => {
    try {
      setImportResults([])
      setShowImportSummary(false)
      message.loading({ content: 'Reading standard workbook...', key: 'excel_read' })
      const workbook = await readExcelWorkbook(file)
      const parsedWorkbook = parseStandardWorkbook(workbook)

      if (parsedWorkbook.projects.length === 0) {
        const blockerText =
          parsedWorkbook.workbook_blockers.length > 0
            ? parsedWorkbook.workbook_blockers[0]
            : 'No project data found in the workbook.'
        message.warning({ content: blockerText, key: 'excel_read', duration: 5 })
        return false
      }

      setWorkbookFileName(file.name)
      setStandardWorkbookPreview(parsedWorkbook)
      setIsWorkbookPreviewOpen(true)

      if (parsedWorkbook.workbook_blockers.length > 0) {
        message.warning({
          content: 'Workbook parsed with blockers. Review them before importing.',
          key: 'excel_read',
          duration: 5
        })
      } else {
        message.success({
          content: `Workbook parsed successfully. ${parsedWorkbook.projects.length} project(s) ready for review.`,
          key: 'excel_read'
        })
      }
    } catch (error) {
      console.error('Error reading Excel file:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      message.error({
        content: `Failed to read Excel file: ${errorMessage}`,
        key: 'excel_read',
        duration: 5
      })
    }
    return false
  }

  const executeStandardWorkbookImport = async (): Promise<void> => {
    if (!standardWorkbookPreview) return
    if (standardWorkbookPreview.workbook_blockers.length > 0) {
      message.error('Resolve workbook blockers before importing.')
      return
    }

    setIsWorkbookImporting(true)
    try {
      const results: StandardWorkbookProjectImportResult[] = []
      for (const projectPreview of standardWorkbookPreview.projects) {
        const result = await window.api.projects.importStandardWorkbookProject({
          project: projectPreview.project,
          sector_configs: projectPreview.sector_configs,
          rows: projectPreview.rows
        })
        results.push(result)
      }

      const importedProjects = results.length
      const importedUnits = results.reduce((sum, result) => sum + result.imported_units, 0)
      const importedLetters = results.reduce((sum, result) => sum + result.imported_letters, 0)

      setImportResults(results)
      setShowImportSummary(true)
      closeWorkbookPreview(true)
      await fetchProjects()

      message.success(
        `Imported ${importedProjects} project(s), ${importedUnits} unit row(s), and ${importedLetters} maintenance ledger row(s).`
      )
    } catch (error) {
      console.error('Workbook import failed:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      message.error(`Workbook import failed: ${errorMessage}`)
    } finally {
      setIsWorkbookImporting(false)
    }
  }

  const handleEdit = async (record: Project): Promise<void> => {
    setEditingProject(record)
    form.setFieldsValue({
      ...DEFAULT_PROJECT_FORM_VALUES,
      ...record,
      status: record.status || 'Active',
      city: record.city || 'Ahmedabad',
      template_type: record.template_type || 'standard',
      import_profile_key: record.import_profile_key || 'standard_normalized'
    })
    try {
      const configs = await window.api.projects.getSectorPaymentConfigs(record.id!)
      setSectorConfigs(configs.length > 0 ? configs : getDefaultSectorConfigs())
    } catch (error) {
      console.error('Failed to fetch sector payment configs:', error)
      setSectorConfigs(getDefaultSectorConfigs())
    }
    setIsModalOpen(true)
  }

  const handleRates = (record: Project): void => {
    setSelectedProject(record)
    setIsRateModalOpen(true)
  }

  const handleDelete = async (id: number): Promise<void> => {
    Modal.confirm({
      title: 'Are you sure you want to delete this project?',
      content: 'This action cannot be undone.',
      onOk: async () => {
        try {
          await window.api.projects.delete(id)
          message.success('Project deleted successfully')
          fetchProjects()
        } catch {
          message.error('Failed to delete project')
        }
      }
    })
  }

  const handleBulkDelete = (): void => {
    Modal.confirm({
      title: `Delete ${selectedRowKeys.length} projects?`,
      content: (
        <div>
          <p>
            This action cannot be undone. All related units, maintenance letters, and payments will
            also be deleted.
          </p>
          {selectedProjects.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">Projects to delete:</Text>
              <ul style={{ margin: '4px 0 0 20px', fontSize: '12px' }}>
                {selectedProjects.slice(0, 5).map((p) => (
                  <li key={p.id}>{p.name}</li>
                ))}
                {selectedProjects.length > 5 && <li>...and {selectedProjects.length - 5} more</li>}
              </ul>
            </div>
          )}
        </div>
      ),
      okText: 'Delete All',
      okType: 'danger',
      onOk: async () => {
        try {
          await window.api.projects.bulkDelete(selectedRowKeys as number[])
          message.success(`${selectedRowKeys.length} projects deleted successfully`)
          setSelectedRowKeys([])
          fetchProjects()
        } catch (error) {
          console.error(error)
          message.error('Failed to delete projects')
        }
      }
    })
  }

  const handleModalOk = async (): Promise<void> => {
    try {
      const values = await form.validateFields()
      const normalizedValues: Partial<Project> = {
        name: String(values.name || '').trim(),
        address: String(values.address || '').trim(),
        city: String(values.city || '').trim(),
        state: String(values.state || '').trim(),
        pincode: String(values.pincode || '').trim(),
        status: String(values.status || 'Active').trim(),
        account_name: String(values.account_name || '').trim(),
        bank_name: String(values.bank_name || '').trim(),
        account_no: String(values.account_no || '').trim(),
        ifsc_code: String(values.ifsc_code || '')
          .trim()
          .toUpperCase(),
        branch: String(values.branch || '').trim(),
        branch_address: String(values.branch_address || '').trim(),
        qr_code_path: String(values.qr_code_path || '').trim(),
        letterhead_path: String(values.letterhead_path || '').trim(),
        template_type: String(values.template_type || 'standard').trim(),
        import_profile_key: String(values.import_profile_key || 'standard_normalized').trim()
      }

      const preparedSectorConfigs = sectorConfigs
        .map((config) => ({
          sector_code: String(config.sector_code || '').trim().toUpperCase(),
          account_name: String(config.account_name || '').trim(),
          bank_name: String(config.bank_name || '').trim(),
          account_no: String(config.account_no || '').trim(),
          ifsc_code: String(config.ifsc_code || '').trim().toUpperCase(),
          branch: String(config.branch || '').trim(),
          branch_address: String(config.branch_address || '').trim(),
          qr_code_path: String(config.qr_code_path || '').trim()
        }))
        .filter((config) =>
          [
            config.sector_code,
            config.account_name,
            config.bank_name,
            config.account_no,
            config.ifsc_code,
            config.branch,
            config.branch_address,
            config.qr_code_path
          ].some((value) => value.length > 0)
        )

      const seenSectors = new Set<string>()
      for (const config of preparedSectorConfigs) {
        if (!config.sector_code) {
          message.error('Sector code is required for each sector payment row')
          return
        }
        if (seenSectors.has(config.sector_code)) {
          message.error(`Duplicate sector code: ${config.sector_code}`)
          return
        }
        seenSectors.add(config.sector_code)
      }

      let projectId: number
      if (editingProject?.id) {
        await window.api.projects.update(editingProject.id, normalizedValues)
        projectId = editingProject.id
        message.success('Project updated successfully')
      } else {
        projectId = await window.api.projects.create(normalizedValues as Project)
        message.success('Project created successfully')
      }

      await window.api.projects.saveSectorPaymentConfigs(projectId, preparedSectorConfigs)
      setIsModalOpen(false)
      fetchProjects()
    } catch (error) {
      console.error(error)
    }
  }

  const columns = [
    {
      title: 'Code',
      dataIndex: 'project_code',
      key: 'project_code',
      width: 110,
      align: 'center' as const,
      render: (projectCode: string, record: Project) => projectCode || `PRJ-${String(record.id || '').padStart(3, '0')}`
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name'
    },
    {
      title: 'City',
      dataIndex: 'city',
      key: 'city',
      width: 140
    },
    {
      title: 'Workflow',
      key: 'workflow',
      width: 220,
      render: (_: unknown, record: Project) => (
        <Space direction="vertical" size={4}>
          <Tag color="blue">{TEMPLATE_LABELS[record.template_type || 'standard'] || 'Standard Letter'}</Tag>
          <Tag>{IMPORT_PROFILE_LABELS[record.import_profile_key || 'standard_normalized'] || 'Standard Platform Sheet'}</Tag>
        </Space>
      )
    },
    {
      title: `Setup (${currentFY})`,
      key: 'setup_status',
      width: 320,
      render: (_: unknown, record: Project) => {
        const summary = record.id ? projectSetupSummaries[record.id] : undefined
        if (!summary) {
          return <Text type="secondary">Checking setup...</Text>
        }

        const statusColor = summary.ready_for_letters
          ? summary.warnings.length > 0
            ? 'warning'
            : 'success'
          : 'error'
        const statusLabel = summary.ready_for_letters
          ? summary.warnings.length > 0
            ? 'Ready with Warnings'
            : 'Ready'
          : 'Needs Setup'

        return (
          <Space direction="vertical" size={4}>
            <Tag color={statusColor}>{statusLabel}</Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Units: {summary.unit_count} | Sectors:{' '}
              {summary.sector_codes.length > 0 ? summary.sector_codes.join(', ') : 'None'}
            </Text>
            {summary.blockers[0] && (
              <Text type="danger" style={{ fontSize: 12 }}>
                {summary.blockers[0]}
              </Text>
            )}
            {!summary.blockers[0] && summary.warnings[0] && (
              <Text style={{ fontSize: 12, color: '#d48806' }}>{summary.warnings[0]}</Text>
            )}
          </Space>
        )
      }
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'Active' ? 'success' : 'error'}>{status || 'Inactive'}</Tag>
      )
    },
    {
      title: 'Action',
      key: 'actions',
      align: 'center' as const,
      width: 120,
      render: (_: unknown, record: Project) => (
        <Space size="small">
          <Tooltip title="Manage Rates">
            <Button onClick={() => handleRates(record)} size="small">
              Rates
            </Button>
          </Tooltip>
          <Tooltip title="Edit Project">
            <Button icon={<EditOutlined />} onClick={() => void handleEdit(record)} size="small" />
          </Tooltip>
          <Tooltip title="Delete Project">
            <Button
              icon={<DeleteOutlined />}
              danger
              onClick={() => handleDelete(record.id!)}
              size="small"
            />
          </Tooltip>
        </Space>
      )
    }
  ]

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16
          }}
        >
          <Typography.Title level={2} style={{ margin: 0 }}>
            Projects
          </Typography.Title>
          <Space>
            {selectedRowKeys.length > 0 && (
              <Button danger icon={<DeleteOutlined />} onClick={handleBulkDelete}>
                Delete Selected ({selectedRowKeys.length})
              </Button>
            )}
            <Upload
              beforeUpload={(file) => {
                void handleStandardWorkbookImport(file)
                return false
              }}
              showUploadList={false}
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            >
              <Button icon={<UploadOutlined />}>Import Standard Workbook</Button>
            </Upload>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
              Add Project
            </Button>
          </Space>
        </div>

        <Space wrap style={{ marginBottom: 8 }}>
          <Input
            placeholder="Search Project Code, Name, Address, or City..."
            prefix={<SearchOutlined />}
            style={{ width: 250 }}
            allowClear
            onChange={(e) => setSearchText(e.target.value)}
            value={searchText}
          />
          <Select
            placeholder="Status"
            style={{ width: 150 }}
            allowClear
            onChange={(val) => setStatusFilter(val)}
            value={statusFilter}
          >
            <Option value="Active">Active</Option>
            <Option value="Inactive">Inactive</Option>
          </Select>
          <Select
            placeholder="City"
            style={{ width: 150 }}
            allowClear
            onChange={(val) => setCityFilter(val)}
            value={cityFilter}
          >
            {uniqueCities.map((city) => (
              <Option key={city} value={city}>
                {city}
              </Option>
            ))}
          </Select>
        </Space>

        {/* Filter Summary Chips */}
        {hasActiveFilters && (
          <div style={{ marginTop: 16 }}>
            <Space wrap>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                Active filters:
              </Text>
              {searchText && (
                <Tag closable onClose={() => setSearchText('')} style={{ fontSize: '12px' }}>
                  Search: &quot;{searchText}&quot;
                </Tag>
              )}
              {statusFilter && (
                <Tag closable onClose={() => setStatusFilter(null)} style={{ fontSize: '12px' }}>
                  Status: {statusFilter}
                </Tag>
              )}
              {cityFilter && (
                <Tag closable onClose={() => setCityFilter(null)} style={{ fontSize: '12px' }}>
                  City: {cityFilter}
                </Tag>
              )}
              <Button
                type="link"
                size="small"
                onClick={clearAllFilters}
                style={{ fontSize: '12px', padding: 0, height: 'auto' }}
              >
                Clear all
              </Button>
            </Space>
          </div>
        )}
      </Card>

      <Table
        rowSelection={{
          selectedRowKeys,
          onChange: setSelectedRowKeys
        }}
        dataSource={filteredProjects}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
      />

      {/* Project Add/Edit Modal */}
      <Modal
        title={editingProject ? 'Edit Project' : 'Add Project'}
        open={isModalOpen}
        onOk={handleModalOk}
        onCancel={() => setIsModalOpen(false)}
        width={700}
      >
        <Form form={form} layout="vertical" initialValues={DEFAULT_PROJECT_FORM_VALUES}>
          {editingProjectSummary && (
            <Alert
              type={
                editingProjectSummary.ready_for_letters
                  ? editingProjectSummary.warnings.length > 0
                    ? 'warning'
                    : 'success'
                  : 'error'
              }
              showIcon
              icon={
                editingProjectSummary.ready_for_letters ? (
                  <CheckCircleOutlined />
                ) : (
                  <WarningOutlined />
                )
              }
              message={
                editingProjectSummary.ready_for_letters
                  ? editingProjectSummary.warnings.length > 0
                    ? 'Project setup is usable but still has warnings.'
                    : 'Project setup is ready for maintenance letters.'
                  : 'Project setup is incomplete.'
              }
              description={
                <div>
                  <div style={{ marginBottom: 8 }}>
                    Detected sectors:{' '}
                    {editingProjectSummary.sector_codes.length > 0
                      ? editingProjectSummary.sector_codes.join(', ')
                      : 'None'}
                    {' | '}Unit types:{' '}
                    {editingProjectSummary.unit_types.length > 0
                      ? editingProjectSummary.unit_types.join(', ')
                      : 'None'}
                  </div>
                  {editingProjectSummary.blockers.map((blocker) => (
                    <div key={blocker} style={{ color: '#cf1322' }}>
                      {blocker}
                    </div>
                  ))}
                  {editingProjectSummary.warnings.map((warning) => (
                    <div key={warning} style={{ color: '#d48806' }}>
                      {warning}
                    </div>
                  ))}
                </div>
              }
              style={{ marginBottom: 16 }}
            />
          )}
          <Tabs defaultActiveKey="basic">
            <TabPane tab="Basic Information" key="basic">
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '16px',
                  marginTop: 16
                }}
              >
                <Form.Item label="Project Code">
                  <Input
                    value={editingProject?.project_code || 'Auto-generated on save'}
                    disabled
                  />
                </Form.Item>

                <Form.Item
                  name="name"
                  label="Project Name"
                  rules={[{ required: true, message: 'Please enter project name' }]}
                  style={{ gridColumn: 'span 2' }}
                >
                  <Input />
                </Form.Item>

                <Form.Item name="address" label="Address" style={{ gridColumn: 'span 2' }}>
                  <Input.TextArea rows={2} />
                </Form.Item>

                <Form.Item name="city" label="City">
                  <Input />
                </Form.Item>

                <Form.Item name="state" label="State">
                  <Input />
                </Form.Item>

                <Form.Item name="pincode" label="Pincode">
                  <Input />
                </Form.Item>

                <Form.Item name="status" label="Status">
                  <Select>
                    <Option value="Active">Active</Option>
                    <Option value="Inactive">Inactive</Option>
                  </Select>
                </Form.Item>

                <Form.Item
                  name="template_type"
                  label="Workflow Template"
                  rules={[{ required: true, message: 'Please select workflow template' }]}
                >
                  <Select
                    options={TEMPLATE_OPTIONS.map((option) => ({
                      value: option.value,
                      label: option.label
                    }))}
                  />
                </Form.Item>

                <Form.Item
                  name="import_profile_key"
                  label="Import Profile"
                  rules={[{ required: true, message: 'Please select import profile' }]}
                  style={{ gridColumn: 'span 2' }}
                >
                  <Select
                    options={IMPORT_PROFILE_OPTIONS.map((option) => ({
                      value: option.value,
                      label: `${option.label} - ${option.description}`
                    }))}
                  />
                </Form.Item>
              </div>
            </TabPane>

            <TabPane tab="Bank Details" key="bank" icon={<BankOutlined />}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '16px',
                  marginTop: 16
                }}
              >
                <Form.Item name="account_name" label="Name" style={{ gridColumn: 'span 2' }}>
                  <Input />
                </Form.Item>

                <Form.Item name="bank_name" label="Bank Name">
                  <Input />
                </Form.Item>

                <Form.Item name="account_no" label="Account No.">
                  <Input />
                </Form.Item>

                <Form.Item name="ifsc_code" label="IFSC Code">
                  <Input />
                </Form.Item>

                <Form.Item name="branch" label="Branch">
                  <Input />
                </Form.Item>

                <Form.Item
                  name="branch_address"
                  label="Branch Address"
                  style={{ gridColumn: 'span 2' }}
                >
                  <Input />
                </Form.Item>

                <Form.Item name="qr_code_path" label="Default QR / Barcode" style={{ gridColumn: 'span 2' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Input placeholder="Default QR image path (.png/.jpg/.jpeg)" />
                    <Button
                      icon={<FolderOpenOutlined />}
                      onClick={() => void pickProjectFile('qr_code_path', 'Select Default QR / Barcode')}
                    >
                      Browse
                    </Button>
                  </div>
                </Form.Item>

                <Form.Item name="letterhead_path" label="Letterhead Image" style={{ gridColumn: 'span 2' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Input placeholder="Letterhead image path (.png/.jpg/.jpeg)" />
                    <Button
                      icon={<FolderOpenOutlined />}
                      onClick={() => void pickProjectFile('letterhead_path', 'Select Letterhead Image')}
                    >
                      Browse
                    </Button>
                  </div>
                </Form.Item>
              </div>
            </TabPane>

            <TabPane tab="Sector Payment QR" key="sector-payment">
              <div style={{ marginTop: 16 }}>
                <Paragraph type="secondary" style={{ marginBottom: 12 }}>
                  Configure sector-specific bank and barcode details. Maintenance letters will use
                  these values by sector and fallback to project bank details if a sector is not
                  configured.
                </Paragraph>

                {editingProjectSummary && editingProjectSummary.sector_codes.length > 0 && (
                  <Alert
                    type="info"
                    showIcon
                    message={`Detected sectors: ${editingProjectSummary.sector_codes.join(', ')}`}
                    description="Add sector rows only where bank account or barcode differs from the project default."
                    style={{ marginBottom: 16 }}
                  />
                )}

                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                  {sectorConfigs.map((config, index) => (
                    <Card
                      key={`sector-config-${index}`}
                      size="small"
                      title={`Sector Config ${index + 1}`}
                      extra={
                        <Button
                          size="small"
                          danger
                          onClick={() => handleRemoveSectorConfigRow(index)}
                          disabled={sectorConfigs.length <= 1}
                        >
                          Remove
                        </Button>
                      }
                    >
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: '12px'
                        }}
                      >
                        <Input
                          value={String(config.sector_code || '')}
                          onChange={(e) =>
                            handleSectorConfigChange(index, 'sector_code', e.target.value)
                          }
                          placeholder="Sector Code (A/B/C)"
                        />
                        <Input
                          value={String(config.account_name || '')}
                          onChange={(e) =>
                            handleSectorConfigChange(index, 'account_name', e.target.value)
                          }
                          placeholder="Account Name"
                        />
                        <Input
                          value={String(config.bank_name || '')}
                          onChange={(e) =>
                            handleSectorConfigChange(index, 'bank_name', e.target.value)
                          }
                          placeholder="Bank Name"
                        />
                        <Input
                          value={String(config.account_no || '')}
                          onChange={(e) =>
                            handleSectorConfigChange(index, 'account_no', e.target.value)
                          }
                          placeholder="Account Number"
                        />
                        <Input
                          value={String(config.ifsc_code || '')}
                          onChange={(e) =>
                            handleSectorConfigChange(index, 'ifsc_code', e.target.value)
                          }
                          placeholder="IFSC Code"
                        />
                        <Input
                          value={String(config.branch || '')}
                          onChange={(e) => handleSectorConfigChange(index, 'branch', e.target.value)}
                          placeholder="Branch"
                        />
                        <Input
                          value={String(config.branch_address || '')}
                          onChange={(e) =>
                            handleSectorConfigChange(index, 'branch_address', e.target.value)
                          }
                          placeholder="Branch Address"
                          style={{ gridColumn: 'span 2' }}
                        />
                        <div style={{ display: 'flex', gap: 8, gridColumn: 'span 2' }}>
                          <Input
                            value={String(config.qr_code_path || '')}
                            onChange={(e) =>
                              handleSectorConfigChange(index, 'qr_code_path', e.target.value)
                            }
                            placeholder="QR Image Path (.png/.jpg/.jpeg)"
                          />
                          <Button icon={<FolderOpenOutlined />} onClick={() => void pickSectorQrFile(index)}>
                            Browse
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}

                  <Space>
                    <Button onClick={handleAddSectorConfigRow}>Add Sector Row</Button>
                    <Button onClick={() => setSectorConfigs(getDefaultSectorConfigs())}>
                      Reset to A/B/C
                    </Button>
                  </Space>
                </Space>
              </div>
            </TabPane>
          </Tabs>
        </Form>
      </Modal>

      <Modal
        title={workbookFileName ? `Import Standard Workbook: ${workbookFileName}` : 'Import Standard Workbook'}
        open={isWorkbookPreviewOpen}
        onCancel={() => closeWorkbookPreview()}
        onOk={() => void executeStandardWorkbookImport()}
        okText="Import Workbook"
        okButtonProps={{
          disabled:
            !standardWorkbookPreview ||
            standardWorkbookPreview.projects.length === 0 ||
            standardWorkbookPreview.workbook_blockers.length > 0
        }}
        confirmLoading={isWorkbookImporting}
        width={860}
      >
        {standardWorkbookPreview && (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Alert
              type={
                standardWorkbookPreview.workbook_blockers.length > 0
                  ? 'error'
                  : standardWorkbookPreview.workbook_warnings.length > 0
                    ? 'warning'
                    : 'success'
              }
              showIcon
              message={
                standardWorkbookPreview.workbook_blockers.length > 0
                  ? 'Workbook has blockers and cannot be imported yet.'
                  : standardWorkbookPreview.workbook_warnings.length > 0
                    ? 'Workbook is importable but has warnings to review.'
                    : 'Workbook is ready to import.'
              }
              description={
                <div>
                  <div style={{ marginBottom: 8 }}>
                    Projects: {standardWorkbookPreview.projects.length}
                    {' | '}Workbook warnings: {standardWorkbookPreview.workbook_warnings.length}
                    {' | '}Workbook blockers: {standardWorkbookPreview.workbook_blockers.length}
                  </div>
                  {standardWorkbookPreview.workbook_blockers.slice(0, 6).map((blocker) => (
                    <div key={blocker} style={{ color: '#cf1322' }}>
                      {blocker}
                    </div>
                  ))}
                  {standardWorkbookPreview.workbook_warnings.slice(0, 4).map((warning) => (
                    <div key={warning} style={{ color: '#d48806' }}>
                      {warning}
                    </div>
                  ))}
                </div>
              }
            />

            <List
              dataSource={standardWorkbookPreview.projects}
              renderItem={(projectPreview) => {
                const importAction = existingProjectNameSet.has(
                  projectPreview.project.name.trim().toLowerCase()
                )
                  ? 'Update Existing'
                  : 'Create New'

                return (
                  <List.Item>
                    <Card
                      size="small"
                      title={projectPreview.project.name}
                      style={{ width: '100%' }}
                      extra={
                        <Space>
                          <Tag color={importAction === 'Create New' ? 'green' : 'blue'}>{importAction}</Tag>
                          <Tag>
                            {TEMPLATE_LABELS[projectPreview.project.template_type || 'standard'] ||
                              'Standard Letter'}
                          </Tag>
                          <Tag>
                            {IMPORT_PROFILE_LABELS[
                              projectPreview.project.import_profile_key || 'standard_normalized'
                            ] || 'Standard Platform Sheet'}
                          </Tag>
                        </Space>
                      }
                    >
                      <div style={{ display: 'grid', gap: 6 }}>
                        <Text type="secondary">
                          Units: {projectPreview.unit_count} | Ledger rows: {projectPreview.ledger_row_count} |
                          Importable letters: {projectPreview.letter_count}
                        </Text>
                        <Text type="secondary">
                          Sectors:{' '}
                          {projectPreview.sector_codes.length > 0
                            ? projectPreview.sector_codes.join(', ')
                            : 'None'}
                          {' | '}Unit types:{' '}
                          {projectPreview.unit_types.length > 0
                            ? projectPreview.unit_types.join(', ')
                            : 'None'}
                        </Text>
                        {projectPreview.blockers.map((blocker) => (
                          <Text key={blocker} type="danger" style={{ fontSize: 12 }}>
                            {blocker}
                          </Text>
                        ))}
                        {projectPreview.warnings.slice(0, 4).map((warning) => (
                          <Text key={warning} style={{ fontSize: 12, color: '#d48806' }}>
                            {warning}
                          </Text>
                        ))}
                      </div>
                    </Card>
                  </List.Item>
                )
              }}
            />
          </Space>
        )}
      </Modal>

      {/* Import Summary Modal */}
      <Modal
        title="Import Summary"
        open={showImportSummary}
        onCancel={() => setShowImportSummary(false)}
        footer={[
          <Button key="close" onClick={() => setShowImportSummary(false)}>
            Close
          </Button>
        ]}
        width={600}
      >
        <div style={{ maxHeight: '400px', overflow: 'auto' }}>
          <List
            dataSource={importResults}
            renderItem={(result, index) => (
              <List.Item>
                <List.Item.Meta
                  title={`${index + 1}. ${result.project_code || 'PRJ'} - ${result.project_name}`}
                  description={
                    <div>
                      <div>Action: {result.created ? 'Created new project' : 'Updated existing project'}</div>
                      <div>Imported units: {result.imported_units}</div>
                      <div>Imported maintenance rows: {result.imported_letters}</div>
                      <div>
                        Sector payment config: {result.sector_configs_merged ? 'Merged from workbook' : 'No change'}
                      </div>
                    </div>
                  }
                />
              </List.Item>
            )}
          />
        </div>
      </Modal>

      {/* Maintenance Rates Modal */}
      {selectedProject && (
        <MaintenanceRateModal
          visible={isRateModalOpen}
          projectId={selectedProject.id!}
          projectName={selectedProject.name}
          onCancel={() => setIsRateModalOpen(false)}
        />
      )}
    </div>
  )
}

export default Projects
