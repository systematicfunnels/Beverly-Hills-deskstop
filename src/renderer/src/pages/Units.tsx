import React, { useState, useEffect, useCallback } from 'react'
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
  DividerProps
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, UploadOutlined } from '@ant-design/icons'
import { Unit, Project } from '@preload/types'
import { readExcelFile } from '../utils/excelReader'

const { Title } = Typography
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

  // Helper function to map a single row to a Unit object
  const mapRowToUnit = useCallback(
    (row: Record<string, unknown>, projectId: number | null): ImportUnitPreview | null => {
      // Unique ID for preview editing
      const previewId = (row.__id as string) || Math.random().toString(36).substr(2, 9)

      // Create a normalized version of the row with lowercase keys and trimmed values
      const normalizedRow: Record<string, unknown> = {}
      Object.keys(row).forEach((key) => {
        const normalizedKey = String(key).toLowerCase().trim()
        normalizedRow[normalizedKey] = row[key]
      })

      // Helper to find value by multiple possible keys
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

      // Auto-detect project if not selected
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

      // Try to find Unit Number - expanded search
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

      // If unitNumber is empty and we should ignore it, return null
      if (!unitNumber && ignoreEmptyUnits) return null

      // Try to find Owner Name - expanded search
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

      // Fallback 1: Extract unit from owner name if it looks like "Name D-3/403" or "Name (A-101)"
      if (!unitNumber && ownerName) {
        const unitPattern = /([A-Z][-/\s]?\d+([-/\s]\d+)?)/i
        const match = ownerName.match(unitPattern)
        if (match) {
          unitNumber = match[0].trim()
          ownerName = ownerName.replace(match[0], '').replace(/[()]/g, '').trim()
        }
      }

      // Fallback 2: Scan ALL columns for anything that looks like a unit number if still empty
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

      // Final check for empty unit
      if (!unitNumber && ignoreEmptyUnits) return null

      // If unitNumber is still empty, we still want to show the row but allow manual entry
      // We only skip if the row is completely empty or just header text
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
        unit_type: String(
          getValue(['bungalow', 'type', 'unit type', 'category', 'usage']) ||
            (normalizedRow['bungalow'] !== undefined ? 'Bungalow' : 'Bungalow')
        ).trim(),
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
          // Assign internal ID if not present
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
    // Pre-select project if one is already filtered in the main view
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
      // Process mappedPreview into a format the backend can use to "explode" rows
      // We need to identify which columns are years and which are add-ons
      const rowsToImport = mappedPreview.map((row) => {
        const years: {
          financial_year: string
          base_amount: number
          arrears: number
          add_ons: { name: string; amount: number }[]
        }[] = []

        // Find all keys that look like financial years (e.g., "2018-19")
        const yearKeys = Object.keys(row).filter((key) => /^\d{4}-\d{2}$/.test(key))

        for (const year of yearKeys) {
          const baseAmount = Number(row[year]) || 0
          const addons: { name: string; amount: number }[] = []
          let arrears = 0

          // Check for Arrears column - can be "Arrears", "O/S", "Balance"
          const arrearsValue = row['Arrears'] || row['O/S'] || row['Balance'] || row['Outstanding']
          if (arrearsValue !== undefined) {
            arrears = Number(arrearsValue) || 0
          }

          // Check for Penalty, NA Tax, Cable, etc. associated with this row/context
          // In the wide format, we might have multiple penalty columns.
          // For now, let's look for common addon names in the row
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
      sorter: (a: Unit, b: Unit) => (a.unit_type || '').localeCompare(b.unit_type || '')
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
      sorter: (a: Unit, b: Unit) => (a.status || '').localeCompare(b.status || '')
    },
    {
      title: 'Actions',
      key: 'actions',
      align: 'right' as const,
      render: (_: unknown, record: Unit) => (
        <Space>
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
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
          flexWrap: 'wrap',
          gap: '16px'
        }}
      >
        <Title level={2} style={{ margin: 0 }}>
          Units
        </Title>
        <Space wrap>
          {selectedRowKeys.length > 0 && (
            <Button danger icon={<DeleteOutlined />} onClick={handleBulkDelete}>
              Delete Selected ({selectedRowKeys.length})
            </Button>
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
            <Space>
              <InputNumber
                placeholder="Min Area"
                style={{ width: 100 }}
                value={areaRange[0]}
                onChange={(val) => setAreaRange([val, areaRange[1]])}
              />
              <span>-</span>
              <InputNumber
                placeholder="Max Area"
                style={{ width: 100 }}
                value={areaRange[1]}
                onChange={(val) => setAreaRange([areaRange[0], val])}
              />
            </Space>
          </Space>
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

          <div style={{ marginBottom: 16 }}>
            <Space size="large" align="end" wrap>
              <div>
                <Typography.Text strong>Step 1: Import to Project</Typography.Text>
                <Select
                  placeholder="Select Project"
                  style={{ width: 250, display: 'block', marginTop: 8 }}
                  status={!importProjectId ? 'error' : undefined}
                  value={importProjectId}
                  onChange={setImportProjectId}
                  allowClear
                >
                  {projects.map((p) => (
                    <Option key={p.id} value={p.id}>
                      {p.name}
                    </Option>
                  ))}
                </Select>
              </div>
              <div>
                <Typography.Text strong>Empty Units</Typography.Text>
                <Select
                  value={ignoreEmptyUnits ? 'ignore' : 'keep'}
                  onChange={(val) => setIgnoreEmptyUnits(val === 'ignore')}
                  style={{ width: 150, display: 'block', marginTop: 8 }}
                >
                  <Option value="ignore">Ignore Empty</Option>
                  <Option value="keep">Keep Empty</Option>
                </Select>
              </div>
              <div>
                <Typography.Text strong>Default Area</Typography.Text>
                <InputNumber
                  placeholder="Default Area"
                  value={defaultArea}
                  onChange={(val) => setDefaultArea(val || 0)}
                  style={{ width: 120, display: 'block', marginTop: 8 }}
                />
              </div>
            </Space>
          </div>

          {mappedPreview.length > 0 && (
            <div>
              <Typography.Text strong>Step 2: Preview & Edit Data</Typography.Text>
              <Typography.Paragraph type="secondary" style={{ fontSize: '12px', marginTop: 4 }}>
                Double-click on any cell to edit. Red borders indicate missing required fields.
              </Typography.Paragraph>
              <Table
                size="small"
                pagination={{ pageSize: 5 }}
                dataSource={mappedPreview}
                rowKey="previewId"
                columns={[
                  {
                    title: 'Project',
                    key: 'project',
                    width: 150,
                    render: () => {
                      const project = projects.find((p) => p.id === Number(importProjectId))
                      return project ? (
                        project.name
                      ) : (
                        <Typography.Text type="danger">Not Selected</Typography.Text>
                      )
                    }
                  },
                  {
                    title: 'Unit No',
                    dataIndex: 'unit_number',
                    key: 'unit_number',
                    render: (text: string, record: ImportUnitPreview) => (
                      <Input
                        size="small"
                        status={!text ? 'error' : undefined}
                        value={text}
                        onChange={(e) =>
                          handlePreviewCellChange(record.previewId, 'unit_number', e.target.value)
                        }
                        placeholder="Required"
                      />
                    )
                  },
                  {
                    title: 'Owner Name',
                    dataIndex: 'owner_name',
                    key: 'owner_name',
                    render: (text: string, record: ImportUnitPreview) => (
                      <Input
                        size="small"
                        status={!text ? 'error' : undefined}
                        value={text}
                        onChange={(e) =>
                          handlePreviewCellChange(record.previewId, 'owner_name', e.target.value)
                        }
                        placeholder="Required"
                      />
                    )
                  },
                  {
                    title: 'Type',
                    dataIndex: 'unit_type',
                    key: 'unit_type',
                    render: (text: string, record: ImportUnitPreview) => (
                      <Select
                        size="small"
                        value={text}
                        onChange={(val) =>
                          handlePreviewCellChange(record.previewId, 'unit_type', val)
                        }
                        style={{ width: '100%' }}
                      >
                        <Option value="Plot">Plot</Option>
                        <Option value="Bungalow">Bungalow</Option>
                      </Select>
                    )
                  },
                  {
                    title: 'Area',
                    dataIndex: 'area_sqft',
                    key: 'area_sqft',
                    width: 100,
                    render: (text: number, record: ImportUnitPreview) => (
                      <InputNumber
                        size="small"
                        value={text}
                        onChange={(val) =>
                          handlePreviewCellChange(record.previewId, 'area_sqft', val)
                        }
                        style={{ width: '100%' }}
                      />
                    )
                  },
                  {
                    title: 'Status',
                    dataIndex: 'status',
                    key: 'status',
                    render: (text: string, record: ImportUnitPreview) => (
                      <Select
                        size="small"
                        value={text}
                        onChange={(val) => handlePreviewCellChange(record.previewId, 'status', val)}
                        style={{ width: '100%' }}
                      >
                        <Option value="Active">Active</Option>
                        <Option value="Inactive">Inactive</Option>
                      </Select>
                    )
                  },
                  {
                    title: 'Contact',
                    dataIndex: 'contact_number',
                    key: 'contact_number',
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
                      />
                    )
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
                        style={{ width: '100%' }}
                      />
                    )
                  }
                ]}
                scroll={{ x: true }}
                style={{ marginTop: 8 }}
              />
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
