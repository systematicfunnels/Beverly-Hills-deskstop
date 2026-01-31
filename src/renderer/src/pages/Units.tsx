import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  InputNumber,
  message,
  Select,
  Upload,
  Divider,
  Typography,
  Card,
  Alert,
  DividerProps,
  Tag,
  Tooltip
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  UploadOutlined,
  FilePdfOutlined,
  SolutionOutlined
} from '@ant-design/icons'
import { IndianRupee } from 'lucide-react'
import { Unit, Project } from '@preload/types'
import { readExcelFile } from '../utils/excelReader'

const { Title, Text, Paragraph } = Typography
const { Option } = Select
const { Search } = Input

interface ImportUnitPreview extends Unit {
  previewId: string
  [key: string]: unknown
}

const Units: React.FC = () => {
  const [units, setUnits] = useState<Unit[]>([])
  const [filteredUnits, setFilteredUnits] = useState<Unit[]>([])
  const [searchText, setSearchText] = useState('')
  const [selectedProject, setSelectedProject] = useState<number | null>(null)
  const [selectedUnitType, setSelectedUnitType] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [areaRange, setAreaRange] = useState<[number | null, number | null]>([null, null])

  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null)

  const [importData, setImportData] = useState<Record<string, unknown>[]>([])
  const [mappedPreview, setMappedPreview] = useState<ImportUnitPreview[]>([])
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [importProjectId, setImportProjectId] = useState<number | null>(null)
  const [ignoreEmptyUnits, setIgnoreEmptyUnits] = useState(true)
  const [defaultArea, setDefaultArea] = useState<number>(0)

  const [form] = Form.useForm()
  const navigate = useNavigate()

  // Memoized filter status for performance
  const hasActiveFilters = useMemo(() => {
    return (
      searchText ||
      selectedProject ||
      selectedUnitType ||
      statusFilter ||
      areaRange[0] !== null ||
      areaRange[1] !== null
    )
  }, [searchText, selectedProject, selectedUnitType, statusFilter, areaRange])

  // Find project name by ID
  const getProjectNameById = useCallback(
    (id: number | null) => {
      if (!id) return ''
      const project = projects.find((p) => p.id === id)
      return project?.name || ''
    },
    [projects]
  )

  // Clear all filters
  const clearAllFilters = useCallback(() => {
    setSearchText('')
    setSelectedProject(null)
    setSelectedUnitType(null)
    setStatusFilter(null)
    setAreaRange([null, null])
    setSelectedRowKeys([])
  }, [])

  // Helper function to map a single row to a Unit object
  const mapRowToUnit = useCallback(
    (row: Record<string, unknown>, projectId: number | null): ImportUnitPreview | null => {
      const previewId = (row.__id as string) || Math.random().toString(36).substr(2, 9)
      const normalizedRow: Record<string, unknown> = {}
      Object.keys(row).forEach((key) => {
        const normalizedKey = String(key).toLowerCase().trim()
        normalizedRow[normalizedKey] = row[key]
      })

      const getValue = (possibleKeys: string[]): unknown => {
        for (const key of possibleKeys) {
          if (
            normalizedRow[key] !== undefined &&
            normalizedRow[key] !== null &&
            String(normalizedRow[key]).trim() !== ''
          ) {
            return normalizedRow[key]
          }
        }
        return undefined
      }

      let effectiveProjectId = projectId
      if (!effectiveProjectId) {
        const projectName = String(getValue(['project', 'building', 'project name']) || '')
          .trim()
          .toLowerCase()
        if (projectName) {
          const matchedProject = projects.find((p) => p.name.toLowerCase() === projectName)
          if (matchedProject) {
            effectiveProjectId = matchedProject.id!
          }
        }
      }

      let unitNumber = String(
        getValue([
          'unit number',
          'unit',
          'unit_no',
          'unitno',
          'particulars',
          'flat',
          'flat no',
          'flat_no',
          'flat number',
          'plot',
          'plot no',
          'plot_no',
          'plot number',
          'member code',
          'id',
          'shop',
          'office'
        ]) || ''
      ).trim()

      if (!unitNumber && ignoreEmptyUnits) return null

      let ownerName = String(
        getValue([
          'owner',
          'name',
          'owner name',
          'ownername',
          'to',
          'respected sir / madam',
          'member',
          'member name',
          'unit owner',
          'unit owner name',
          'customer',
          'client'
        ]) || ''
      ).trim()

      if (!unitNumber && ownerName) {
        const unitPattern = /([A-Z][-/\s]?\d+([-/\s]\d+)?)/i
        const match = ownerName.match(unitPattern)
        if (match) {
          unitNumber = match[0].trim()
          ownerName = ownerName.replace(match[0], '').replace(/[()]/g, '').trim()
        }
      }

      if (!unitNumber) {
        const unitRegex = /^[A-Z][-/\s]?\d+([-/\s]\d+)?$/i
        for (const key of Object.keys(normalizedRow)) {
          const val = String(normalizedRow[key]).trim()
          if (unitRegex.test(val)) {
            unitNumber = val
            break
          }
        }
      }

      if (!unitNumber && ignoreEmptyUnits) return null
      if (!unitNumber && !ownerName && Object.keys(row).length <= 1) return null
      if (unitNumber && /^(particulars|unit|flat|plot|id|no|shop|office)$/i.test(unitNumber))
        return null

      const rawArea = Number(
        String(
          getValue([
            'area',
            'sqft',
            'area_sqft',
            'area sqft',
            'plot area sqft',
            'sq.ft',
            'sq-ft',
            'builtup',
            'built up'
          ]) || '0'
        ).replace(/[^0-9.]/g, '')
      )

      return {
        ...row,
        previewId,
        project_id: effectiveProjectId || 0,
        unit_number: unitNumber,
        unit_type: (() => {
          const raw = String(
            getValue(['bungalow', 'type', 'unit type', 'category', 'usage']) ||
              (normalizedRow['bungalow'] !== undefined ? 'Bungalow' : 'Plot')
          )
            .trim()
            .toLowerCase()

          if (['bungalow', 'yes', 'y', '1', 'true'].includes(raw)) return 'Bungalow'
          return 'Plot' // Default to Plot for 'plot', 'no', 'n', '0', 'false' or any other value
        })(),
        area_sqft: rawArea || defaultArea,
        owner_name: ownerName || '',
        status: String(getValue(['status', 'occupancy']) || 'Active').trim(),
        penalty: Number(getValue(['penalty', 'opening penalty', 'penalty amount']) || 0)
      }
    },
    [projects, ignoreEmptyUnits, defaultArea]
  )

  useEffect(() => {
    if (importData.length > 0) {
      const preview = importData
        .map((row, index) => {
          if (!row.__id) row.__id = `row-${index}`
          return mapRowToUnit(row, importProjectId)
        })
        .filter((u): u is ImportUnitPreview => u !== null)
      setMappedPreview(preview)
    } else {
      setMappedPreview([])
    }
  }, [importData, importProjectId, mapRowToUnit])

  const fetchData = async (): Promise<void> => {
    setLoading(true)
    try {
      const [unitsData, projectsData] = await Promise.all([
        window.api.units.getAll(),
        window.api.projects.getAll()
      ])
      setUnits(unitsData)
      setFilteredUnits(unitsData)
      setProjects(projectsData)
      setSelectedRowKeys([])
    } catch {
      message.error('Failed to fetch data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    const filtered = units.filter((unit) => {
      const matchSearch =
        unit.unit_number.toLowerCase().includes(searchText.toLowerCase()) ||
        unit.owner_name.toLowerCase().includes(searchText.toLowerCase())
      const matchProject = !selectedProject || unit.project_id === selectedProject
      const matchType = !selectedUnitType || unit.unit_type === selectedUnitType
      const matchStatus = !statusFilter || unit.status === statusFilter
      const matchMinArea = areaRange[0] === null || unit.area_sqft >= areaRange[0]
      const matchMaxArea = areaRange[1] === null || unit.area_sqft <= areaRange[1]

      return matchSearch && matchProject && matchType && matchStatus && matchMinArea && matchMaxArea
    })
    setFilteredUnits(filtered)
  }, [searchText, selectedProject, selectedUnitType, statusFilter, areaRange, units])

  const handleAdd = (): void => {
    setEditingUnit(null)
    form.resetFields()
    setIsModalOpen(true)
  }

  const handleEdit = (record: Unit): void => {
    setEditingUnit(record)
    form.setFieldsValue(record)
    setIsModalOpen(true)
  }

  const handleDelete = async (id: number): Promise<void> => {
    Modal.confirm({
      title: 'Are you sure?',
      onOk: async () => {
        await window.api.units.delete(id)
        message.success('Unit deleted')
        fetchData()
      }
    })
  }

  const handleBulkDelete = async (): Promise<void> => {
    Modal.confirm({
      title: `Are you sure you want to delete ${selectedRowKeys.length} units?`,
      content: 'This action cannot be undone.',
      okText: 'Yes, Delete',
      okType: 'danger',
      cancelText: 'No',
      onOk: async () => {
        setLoading(true)
        try {
          await window.api.units.bulkDelete(selectedRowKeys as number[])
          message.success(`Successfully deleted ${selectedRowKeys.length} units`)
          fetchData()
        } catch {
          message.error('Failed to delete units')
        } finally {
          setLoading(false)
        }
      }
    })
  }

  const handleModalOk = async (): Promise<void> => {
    const values = await form.validateFields()
    if (editingUnit?.id) {
      await window.api.units.update(editingUnit.id, values)
    } else {
      await window.api.units.create(values)
    }
    setIsModalOpen(false)
    fetchData()
  }

  const handleImport = async (file: File): Promise<boolean> => {
    if (selectedProject) {
      setImportProjectId(selectedProject)
    }

    try {
      message.loading({ content: 'Reading Excel file...', key: 'excel_read' })
      const jsonData = await readExcelFile(file)

      if (jsonData.length === 0) {
        message.warning({ content: 'No data found in the Excel file', key: 'excel_read' })
        return false
      }

      message.success({ content: 'Excel file read successfully', key: 'excel_read' })
      setImportData(jsonData)
      setIsImportModalOpen(true)
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

  const handleImportOk = async (): Promise<void> => {
    if (!importProjectId) {
      message.error('Please select a project for import')
      return
    }

    setLoading(true)
    try {
      const rowsToImport = mappedPreview.map((row) => {
        const years: {
          financial_year: string
          base_amount: number
          arrears: number
          add_ons: { name: string; amount: number }[]
        }[] = []

        const yearKeys = Object.keys(row).filter((key) => /^\d{4}-\d{2}$/.test(key))

        for (const year of yearKeys) {
          const baseAmount = Number(row[year]) || 0
          const addons: { name: string; amount: number }[] = []
          let arrears = 0

          const arrearsValue = row['Arrears'] || row['O/S'] || row['Balance'] || row['Outstanding']
          if (arrearsValue !== undefined) {
            arrears = Number(arrearsValue) || 0
          }

          const possibleAddons = [
            { key: 'NA Tax', name: 'NA Tax' },
            { key: 'N.A Tax', name: 'NA Tax' },
            { key: 'Cable', name: 'Cable' },
            { key: 'Rd & NA', name: 'Road & NA Charges' },
            { key: 'Water', name: 'Water Charges' },
            { key: 'Interest', name: 'Interest' }
          ]

          for (const addon of possibleAddons) {
            if (row[addon.key] !== undefined && Number(row[addon.key]) > 0) {
              addons.push({ name: addon.name, amount: Number(row[addon.key]) })
            }
          }

          years.push({
            financial_year: year,
            base_amount: baseAmount,
            arrears: arrears,
            add_ons: addons
          })
        }

        return {
          unit_number: row.unit_number,
          owner_name: row.owner_name,
          unit_type: row.unit_type,
          area_sqft: row.area_sqft,
          penalty: row.penalty,
          years: years
        }
      })

      console.log('Sending ledger to importLedger:', rowsToImport)
      await window.api.units.importLedger({
        projectId: Number(importProjectId),
        rows: rowsToImport
      })

      message.success(`Successfully imported ${rowsToImport.length} unit records and their history`)
      setIsImportModalOpen(false)
      setImportData([])
      setMappedPreview([])
      setImportProjectId(null)
      fetchData()
    } catch (error: unknown) {
      console.error('Import failed:', error)
      const messageText = error instanceof Error ? error.message : 'Check console for details'
      message.error(`Failed to import ledger: ${messageText}`)
    } finally {
      setLoading(false)
    }
  }

  const handlePreviewCellChange = (previewId: string, field: string, value: unknown): void => {
    setMappedPreview((prev) =>
      prev.map((u) => {
        if (u.previewId === previewId) {
          return { ...u, [field]: value }
        }
        return u
      })
    )
  }

  const columns = [
    {
      title: 'Project',
      dataIndex: 'project_name',
      key: 'project_name',
      fixed: 'left' as const,
      sorter: (a: Unit, b: Unit) => (a.project_name || '').localeCompare(b.project_name || '')
    },
    {
      title: 'Unit No',
      dataIndex: 'unit_number',
      key: 'unit_number',
      sorter: (a: Unit, b: Unit) => a.unit_number.localeCompare(b.unit_number)
    },
    {
      title: 'Type',
      dataIndex: 'unit_type',
      key: 'unit_type',
      sorter: (a: Unit, b: Unit) => (a.unit_type || '').localeCompare(b.unit_type || ''),
      render: (type: string) => {
        const color = type === 'Bungalow' ? 'blue' : 'green'
        return <Tag color={color}>{type || 'Plot'}</Tag>
      }
    },
    {
      title: 'Owner',
      dataIndex: 'owner_name',
      key: 'owner_name',
      sorter: (a: Unit, b: Unit) => a.owner_name.localeCompare(b.owner_name)
    },
    {
      title: 'Contact',
      dataIndex: 'contact_number',
      key: 'contact_number',
      render: (text: string) => text || '-'
    },
    {
      title: 'Area (sqft)',
      dataIndex: 'area_sqft',
      key: 'area_sqft',
      align: 'right' as const,
      sorter: (a: Unit, b: Unit) => a.area_sqft - b.area_sqft
    },
    {
      title: 'Penalty',
      dataIndex: 'penalty',
      key: 'penalty',
      align: 'right' as const,
      render: (val: number) => (val ? `₹${val}` : '-'),
      sorter: (a: Unit, b: Unit) => (a.penalty || 0) - (b.penalty || 0)
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      sorter: (a: Unit, b: Unit) => (a.status || '').localeCompare(b.status || ''),
      render: (status: string) => {
        const color = status === 'Active' ? 'success' : 'default'
        return <Tag color={color}>{status || 'Active'}</Tag>
      }
    },
    {
      title: 'Actions',
      key: 'actions',
      align: 'right' as const,
      render: (_: unknown, record: Unit) => (
        <Space>
          <Tooltip title="Generate maintenance letter">
            <Button
              size="small"
              icon={<FilePdfOutlined />}
              onClick={() => navigate('/billing', { state: { unitId: record.id } })}
            />
          </Tooltip>
          <Tooltip title="Record Payment">
            <Button
              size="small"
              icon={<IndianRupee size={16} />}
              onClick={() => navigate('/payments', { state: { unitId: record.id } })}
            />
          </Tooltip>
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          <Button
            size="small"
            icon={<DeleteOutlined />}
            danger
            onClick={() => handleDelete(record.id!)}
          />
        </Space>
      )
    }
  ]

  return (
    <div style={{ padding: '24px' }}>
      {/* Enhanced header with selection feedback */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 24,
          flexWrap: 'wrap',
          gap: '16px'
        }}
      >
        <div>
          <Title level={2} style={{ margin: 0, display: 'inline', marginRight: 12 }}>
            Units
          </Title>
          {selectedRowKeys.length > 0 && (
            <Text type="secondary" style={{ fontSize: '14px' }}>
              ({selectedRowKeys.length} selected)
            </Text>
          )}
        </div>
        <Space wrap>
          {selectedRowKeys.length > 0 && (
            <>
              <Button
                type="primary"
                icon={<SolutionOutlined />}
                onClick={() => navigate('/billing', { state: { unitIds: selectedRowKeys } })}
              >
                Batch Letters ({selectedRowKeys.length})
              </Button>
              <Button danger icon={<DeleteOutlined />} onClick={handleBulkDelete}>
                Delete ({selectedRowKeys.length})
              </Button>
            </>
          )}
          <Upload
            beforeUpload={handleImport}
            showUploadList={false}
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
          >
            <Button icon={<UploadOutlined />}>Import Excel</Button>
          </Upload>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            Add Unit
          </Button>
        </Space>
      </div>

      <Card>
        <div style={{ marginBottom: 24 }}>
          <Space wrap size="middle">
            <Search
              placeholder="Search unit, owner..."
              allowClear
              onSearch={setSearchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 250 }}
              enterButton
              suffix={null}
            />
            <Select
              placeholder="Project"
              style={{ width: 180 }}
              allowClear
              onChange={setSelectedProject}
              value={selectedProject}
            >
              {projects.map((s) => (
                <Option key={s.id} value={s.id}>
                  {s.name}
                </Option>
              ))}
            </Select>
            <Select
              placeholder="Status"
              style={{ width: 130 }}
              allowClear
              onChange={setStatusFilter}
              value={statusFilter}
            >
              <Option value="Active">Active</Option>
              <Option value="Inactive">Inactive</Option>
            </Select>
            <Select
              placeholder="Unit Type"
              style={{ width: 140 }}
              allowClear
              onChange={setSelectedUnitType}
              value={selectedUnitType}
            >
              <Option value="Plot">Plot</Option>
              <Option value="Bungalow">Bungalow</Option>
            </Select>

            {/* Area range with validation */}
            <Input.Group compact>
              <InputNumber
                placeholder="Min Area"
                style={{ width: 100 }}
                value={areaRange[0]}
                onChange={(min) => {
                  if (areaRange[1] && min && min > areaRange[1]) {
                    message.warning('Minimum area cannot be greater than maximum')
                    return
                  }
                  setAreaRange([min, areaRange[1]])
                }}
              />
              <span style={{ padding: '0 8px', lineHeight: '32px' }}>to</span>
              <InputNumber
                placeholder="Max Area"
                style={{ width: 100 }}
                value={areaRange[1]}
                onChange={(max) => {
                  if (areaRange[0] && max && max < areaRange[0]) {
                    message.warning('Maximum area cannot be less than minimum')
                    return
                  }
                  setAreaRange([areaRange[0], max])
                }}
              />
            </Input.Group>
          </Space>

          {/* Filter summary chips */}
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
                {selectedProject && (
                  <Tag
                    closable
                    onClose={() => setSelectedProject(null)}
                    style={{ fontSize: '12px' }}
                  >
                    Project: {getProjectNameById(selectedProject)}
                  </Tag>
                )}
                {selectedUnitType && (
                  <Tag
                    closable
                    onClose={() => setSelectedUnitType(null)}
                    style={{ fontSize: '12px' }}
                  >
                    Type: {selectedUnitType}
                  </Tag>
                )}
                {statusFilter && (
                  <Tag closable onClose={() => setStatusFilter(null)} style={{ fontSize: '12px' }}>
                    Status: {statusFilter}
                  </Tag>
                )}
                {(areaRange[0] !== null || areaRange[1] !== null) && (
                  <Tag
                    closable
                    onClose={() => setAreaRange([null, null])}
                    style={{ fontSize: '12px' }}
                  >
                    Area: {areaRange[0] !== null ? `${areaRange[0]}` : 'Any'} to{' '}
                    {areaRange[1] !== null ? `${areaRange[1]}` : 'Any'}
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
        </div>

        <Table
          rowSelection={{
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys)
          }}
          columns={columns}
          dataSource={filteredUnits}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 'max-content' }}
        />
      </Card>

      {/* Responsive Import Modal */}
      <Modal
        title="Import Units from Excel"
        open={isImportModalOpen}
        onOk={handleImportOk}
        onCancel={() => {
          setIsImportModalOpen(false)
          setImportData([])
          setMappedPreview([])
        }}
        width={800}
        confirmLoading={loading}
        style={{ maxWidth: '90vw' }}
        bodyStyle={{ maxHeight: '70vh', overflow: 'auto' }}
        footer={[
          <Button
            key="cancel"
            onClick={() => {
              setIsImportModalOpen(false)
              setImportData([])
              setMappedPreview([])
            }}
          >
            Cancel
          </Button>,
          <Button key="submit" type="primary" loading={loading} onClick={handleImportOk}>
            Import Units
          </Button>
        ]}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <Alert
            message="Autofill Preview"
            description="The system is automatically identifying columns from your Excel. Check the table below to see if the data is being correctly extracted."
            type="info"
            showIcon
          />

          {projects.length === 0 && (
            <Alert
              message="No Projects Found"
              description="You must create a project before you can import units. Please go to the Projects page first."
              type="warning"
              showIcon
            />
          )}

          {/* Responsive form controls */}
          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '16px',
                alignItems: 'end'
              }}
            >
              <div>
                <Text strong>Step 1: Import to Project</Text>
                <Select
                  placeholder="Select Project"
                  style={{ width: '100%', marginTop: 8 }}
                  status={!importProjectId ? 'error' : undefined}
                  value={importProjectId}
                  onChange={setImportProjectId}
                  allowClear
                  dropdownMatchSelectWidth={false}
                >
                  {projects.map((p) => (
                    <Option key={p.id} value={p.id}>
                      {p.name}
                    </Option>
                  ))}
                </Select>
              </div>
              <div>
                <Text strong>Empty Units</Text>
                <Select
                  value={ignoreEmptyUnits ? 'ignore' : 'keep'}
                  onChange={(val) => setIgnoreEmptyUnits(val === 'ignore')}
                  style={{ width: '100%', marginTop: 8 }}
                  dropdownMatchSelectWidth={false}
                >
                  <Option value="ignore">Ignore Empty</Option>
                  <Option value="keep">Keep Empty</Option>
                </Select>
              </div>
              <div>
                <Text strong>Default Area</Text>
                <InputNumber
                  placeholder="Default Area"
                  value={defaultArea}
                  onChange={(val) => setDefaultArea(val || 0)}
                  style={{ width: '100%', marginTop: 8 }}
                />
              </div>
            </div>
          </div>

          {mappedPreview.length > 0 && (
            <div>
              <Text strong>Step 2: Preview & Edit Data</Text>
              <Paragraph type="secondary" style={{ fontSize: '12px', marginTop: 4 }}>
                Double-click on any cell to edit. Red borders indicate missing required fields.
              </Paragraph>

              {/* Responsive table container */}
              <div
                style={{
                  width: '100%',
                  overflow: 'auto',
                  border: '1px solid #f0f0f0',
                  borderRadius: '4px',
                  marginTop: 8
                }}
              >
                <Table
                  size="small"
                  pagination={{
                    pageSize: 5,
                    responsive: true,
                    showSizeChanger: false,
                    simple: true
                  }}
                  dataSource={mappedPreview}
                  rowKey="previewId"
                  columns={[
                    {
                      title: 'Project',
                      key: 'project',
                      width: 120,
                      render: () => {
                        const project = projects.find((p) => p.id === Number(importProjectId))
                        return project ? (
                          <Text ellipsis style={{ maxWidth: '100px' }}>
                            {project.name}
                          </Text>
                        ) : (
                          <Text type="danger" ellipsis style={{ maxWidth: '100px' }}>
                            Not Selected
                          </Text>
                        )
                      },
                      responsive: ['md']
                    },
                    {
                      title: 'Unit No',
                      dataIndex: 'unit_number',
                      key: 'unit_number',
                      width: 120,
                      render: (text: string, record: ImportUnitPreview) => (
                        <Input
                          size="small"
                          status={!text ? 'error' : undefined}
                          value={text}
                          onChange={(e) =>
                            handlePreviewCellChange(record.previewId, 'unit_number', e.target.value)
                          }
                          placeholder="Required"
                          style={{ width: '100%', minWidth: '80px' }}
                        />
                      ),
                      responsive: ['xs']
                    },
                    {
                      title: 'Owner',
                      dataIndex: 'owner_name',
                      key: 'owner_name',
                      width: 150,
                      render: (text: string, record: ImportUnitPreview) => (
                        <Input
                          size="small"
                          status={!text ? 'error' : undefined}
                          value={text}
                          onChange={(e) =>
                            handlePreviewCellChange(record.previewId, 'owner_name', e.target.value)
                          }
                          placeholder="Required"
                          style={{ width: '100%', minWidth: '100px' }}
                        />
                      ),
                      responsive: ['xs']
                    },
                    {
                      title: 'Type',
                      dataIndex: 'unit_type',
                      key: 'unit_type',
                      width: 100,
                      render: (text: string, record: ImportUnitPreview) => (
                        <Select
                          size="small"
                          value={text}
                          onChange={(val) =>
                            handlePreviewCellChange(record.previewId, 'unit_type', val)
                          }
                          style={{ width: '100%', minWidth: '80px' }}
                          dropdownMatchSelectWidth={false}
                        >
                          <Option value="Plot">Plot</Option>
                          <Option value="Bungalow">Bungalow</Option>
                        </Select>
                      ),
                      responsive: ['sm']
                    },
                    {
                      title: 'Area',
                      dataIndex: 'area_sqft',
                      key: 'area_sqft',
                      width: 90,
                      render: (text: number, record: ImportUnitPreview) => (
                        <InputNumber
                          size="small"
                          value={text}
                          onChange={(val) =>
                            handlePreviewCellChange(record.previewId, 'area_sqft', val)
                          }
                          style={{ width: '100%', minWidth: '70px' }}
                        />
                      ),
                      responsive: ['sm']
                    },
                    {
                      title: 'Status',
                      dataIndex: 'status',
                      key: 'status',
                      width: 100,
                      render: (text: string, record: ImportUnitPreview) => (
                        <Select
                          size="small"
                          value={text}
                          onChange={(val) =>
                            handlePreviewCellChange(record.previewId, 'status', val)
                          }
                          style={{ width: '100%', minWidth: '80px' }}
                          dropdownMatchSelectWidth={false}
                        >
                          <Option value="Active">Active</Option>
                          <Option value="Inactive">Inactive</Option>
                        </Select>
                      ),
                      responsive: ['sm']
                    },
                    {
                      title: 'Contact',
                      dataIndex: 'contact_number',
                      key: 'contact_number',
                      width: 120,
                      render: (text: string, record: ImportUnitPreview) => (
                        <Input
                          size="small"
                          value={text}
                          onChange={(e) =>
                            handlePreviewCellChange(
                              record.previewId,
                              'contact_number',
                              e.target.value
                            )
                          }
                          style={{ width: '100%', minWidth: '100px' }}
                        />
                      ),
                      responsive: ['md']
                    },
                    {
                      title: 'Penalty',
                      dataIndex: 'penalty',
                      key: 'penalty',
                      width: 100,
                      render: (text: number, record: ImportUnitPreview) => (
                        <InputNumber
                          size="small"
                          value={text}
                          onChange={(val) =>
                            handlePreviewCellChange(record.previewId, 'penalty', val)
                          }
                          style={{ width: '100%', minWidth: '70px' }}
                        />
                      ),
                      responsive: ['md']
                    }
                  ]}
                  scroll={{ x: 'max-content' }}
                  style={{ minWidth: '600px' }}
                  components={{
                    header: {
                      cell: ({ style, ...props }: React.HTMLAttributes<HTMLTableCellElement>) => (
                        <th {...props} style={{ ...style, whiteSpace: 'nowrap' }} />
                      )
                    }
                  }}
                />
              </div>
            </div>
          )}

          {importData.length > 0 && mappedPreview.length === 0 && (
            <Alert
              message="No units recognized"
              description="Could not find any unit numbers in the uploaded file. Please make sure your Excel has a column for Unit Number or Flat Number."
              type="warning"
              showIcon
            />
          )}
        </Space>
      </Modal>

      <Modal
        title={editingUnit ? 'Edit Unit' : 'Add Unit'}
        open={isModalOpen}
        onOk={handleModalOk}
        onCancel={() => setIsModalOpen(false)}
        width={600}
        style={{ maxWidth: '90vw' }}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ unit_type: 'Bungalow', status: 'Occupied' }}
        >
          <Divider
            orientation={'left' as DividerProps['orientation']}
            plain
            style={{ marginTop: 0 }}
          >
            Unit Information
          </Divider>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <Form.Item
              name="project_id"
              label="Project"
              rules={[{ required: true }]}
              style={{ gridColumn: 'span 2' }}
            >
              <Select>
                {projects.map((s) => (
                  <Select.Option key={s.id} value={s.id}>
                    {s.name}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="unit_number" label="Unit Number" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="unit_type" label="Unit Type" rules={[{ required: true }]}>
              <Select>
                <Option value="Plot">Plot</Option>
                <Option value="Bungalow">Bungalow</Option>
              </Select>
            </Form.Item>
            <Form.Item name="area_sqft" label="Area (sqft)" rules={[{ required: true }]}>
              <InputNumber style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="penalty" label="Opening Penalty">
              <InputNumber
                style={{ width: '100%' }}
                formatter={(value) => `₹ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                parser={(displayValue) =>
                  displayValue?.replace(/₹\s?|(,*)/g, '') as unknown as number
                }
              />
            </Form.Item>
            <Form.Item name="status" label="Status" rules={[{ required: true }]}>
              <Select>
                <Option value="Active">Active</Option>
                <Option value="Inactive">Inactive</Option>
              </Select>
            </Form.Item>
          </div>

          <Divider orientation={'left' as DividerProps['orientation']}>Owner Information</Divider>
          <Form.Item name="owner_name" label="Owner Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <Form.Item name="contact_number" label="Contact Number">
              <Input />
            </Form.Item>
            <Form.Item name="email" label="Email">
              <Input />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  )
}

export default Units
