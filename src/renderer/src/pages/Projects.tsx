import React, { useState, useEffect, useMemo, useCallback } from 'react'
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
  List
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  UploadOutlined,
  SearchOutlined,
  BankOutlined
} from '@ant-design/icons'
import { IndianRupee } from 'lucide-react'
import { Project } from '@preload/types'
import { readExcelFile } from '../utils/excelReader'
import MaintenanceRateModal from '../components/MaintenanceRateModal'

const { Option } = Select
const { TabPane } = Tabs
const { Text } = Typography

const Projects: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([])
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

  // Import summary state
  const [importSummary, setImportSummary] = useState<Partial<Project>[]>([])
  const [showImportSummary, setShowImportSummary] = useState(false)

  const [form] = Form.useForm()

  const fetchProjects = async (): Promise<void> => {
    setLoading(true)
    try {
      const data = await window.api.projects.getAll()
      setProjects(data)
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

  // Get unique cities for filter
  const uniqueCities = useMemo(() => {
    return Array.from(new Set(projects.map((p) => p.city).filter(Boolean))).sort()
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

  const handleAdd = (): void => {
    setEditingProject(null)
    form.resetFields()
    setIsModalOpen(true)
  }

  const handleImport = async (file: File): Promise<boolean> => {
    try {
      message.loading({ content: 'Reading Excel file...', key: 'excel_read' })
      const jsonData = await readExcelFile(file)

      if (jsonData.length === 0) {
        message.warning({ content: 'No data found in the Excel file', key: 'excel_read' })
        return false
      }

      message.success({ content: 'Excel file read successfully', key: 'excel_read' })

      const projectsToImport = jsonData
        .map((row) => {
          const normalizedRow: Record<string, unknown> = {}
          Object.keys(row).forEach((key) => {
            normalizedRow[String(key).toLowerCase().trim()] = row[key]
          })

          const getValue = (keys: string[]): unknown => {
            for (const key of keys) {
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

          const name = String(
            getValue([
              'name',
              'project name',
              'project',
              'building',
              'building name',
              'society',
              'society name'
            ]) || ''
          ).trim()

          if (!name) return null

          return {
            name,
            address: String(getValue(['address', 'location', 'site address']) || '').trim(),
            city: String(getValue(['city', 'town', 'village']) || 'Bhiwandi').trim(),
            state: String(getValue(['state', 'region']) || '').trim(),
            pincode: String(getValue(['pincode', 'pin', 'zip', 'zipcode']) || '').trim(),
            status: 'Active',
            bank_name: String(
              getValue(['bank', 'bank name', 'bank_name', 'bank details']) || ''
            ).trim(),
            account_no: String(
              getValue(['account', 'account no', 'account number', 'acc no', 'a/c no']) || ''
            ).trim(),
            ifsc_code: String(getValue(['ifsc', 'ifsc code', 'ifsc_code']) || '').trim()
          }
        })
        .filter((p) => p !== null) as Partial<Project>[]

      if (projectsToImport.length === 0) {
        message.warning(
          'No valid projects found in the Excel file. Ensure there is a "Name" column.'
        )
        return false
      }

      setImportSummary(projectsToImport)

      Modal.confirm({
        title: `Import ${projectsToImport.length} projects?`,
        content: (
          <div>
            <p>This will add new projects to the database.</p>
            {projectsToImport.length <= 5 && (
              <div style={{ marginTop: 8 }}>
                <Text type="secondary">Projects to import:</Text>
                <ul style={{ margin: '4px 0 0 20px', fontSize: '12px' }}>
                  {projectsToImport.map((p, idx) => (
                    <li key={idx}>{p.name}</li>
                  ))}
                </ul>
              </div>
            )}
            {projectsToImport.length > 5 && (
              <div style={{ marginTop: 8 }}>
                <Text type="secondary">
                  Showing 5 of {projectsToImport.length} projects to import
                </Text>
                <ul style={{ margin: '4px 0 0 20px', fontSize: '12px' }}>
                  {projectsToImport.slice(0, 5).map((p, idx) => (
                    <li key={idx}>{p.name}</li>
                  ))}
                  <li>...and {projectsToImport.length - 5} more</li>
                </ul>
              </div>
            )}
          </div>
        ),
        onOk: async () => {
          setLoading(true)
          try {
            let count = 0
            for (const project of projectsToImport) {
              await window.api.projects.create(project as Project)
              count++
            }

            message.success({
              content: (
                <span>
                  Successfully imported {count} projects.{' '}
                  <Button
                    type="link"
                    size="small"
                    onClick={() => setShowImportSummary(true)}
                    style={{ padding: 0, height: 'auto' }}
                  >
                    View details
                  </Button>
                </span>
              ),
              duration: 5
            })

            fetchProjects()
          } catch (error) {
            message.error('Failed to import some projects')
            console.error(error)
          } finally {
            setLoading(false)
          }
        }
      })
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

  const handleEdit = (record: Project): void => {
    setEditingProject(record)
    form.setFieldsValue({
      ...record,
      status: record.status || 'Active',
      city: record.city || 'Ahmedabad'
    })
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
      if (editingProject?.id) {
        await window.api.projects.update(editingProject.id, values)
        message.success('Project updated successfully')
      } else {
        await window.api.projects.create(values)
        message.success('Project created successfully')
      }
      setIsModalOpen(false)
      fetchProjects()
    } catch (error) {
      console.error(error)
    }
  }

  const handleViewUnits = useCallback((projectId: number, projectName: string) => {
    // Navigate to units page with project filter
    // This assumes you have routing set up
    window.location.href = `/units?projectId=${projectId}&projectName=${encodeURIComponent(projectName)}`
  }, [])

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name'
    },
    {
      title: 'Address',
      dataIndex: 'address',
      key: 'address',
      ellipsis: true
    },
    {
      title: 'City',
      dataIndex: 'city',
      key: 'city'
    },
    {
      title: 'Units',
      dataIndex: 'unit_count',
      key: 'unit_count',
      align: 'center' as const,
      render: (count: number, record: Project) => (
        <Button
          type="link"
          size="small"
          onClick={() => handleViewUnits(record.id!, record.name)}
          disabled={!count || count === 0}
        >
          {count || 0}
        </Button>
      )
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
      title: 'Created At',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => (date ? new Date(date).toLocaleDateString() : '-')
    },
    {
      title: 'Actions',
      key: 'actions',
      align: 'right' as const,
      render: (_: unknown, record: Project) => (
        <Space size="middle">
          <Tooltip title="Manage Rates">
            <Button
              icon={<IndianRupee size={14} />}
              onClick={() => handleRates(record)}
              size="small"
            />
          </Tooltip>
          <Tooltip title="Edit Project">
            <Button icon={<EditOutlined />} onClick={() => handleEdit(record)} size="small" />
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
              beforeUpload={handleImport}
              showUploadList={false}
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            >
              <Button icon={<UploadOutlined />}>Import Excel</Button>
            </Upload>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
              Add Project
            </Button>
          </Space>
        </div>

        <Space wrap style={{ marginBottom: 8 }}>
          <Input
            placeholder="Search Project Name, Address, or City..."
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
        <Form form={form} layout="vertical" initialValues={{ status: 'Active', city: 'Ahmedabad' }}>
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
              </div>
            </TabPane>
          </Tabs>
        </Form>
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
            dataSource={importSummary}
            renderItem={(project, index) => (
              <List.Item>
                <List.Item.Meta
                  title={`${index + 1}. ${project.name}`}
                  description={
                    <div>
                      {project.city && <div>City: {project.city}</div>}
                      {project.address && <div>Address: {project.address}</div>}
                      {project.bank_name && <div>Bank: {project.bank_name}</div>}
                      {project.account_no && <div>Account: {project.account_no}</div>}
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
