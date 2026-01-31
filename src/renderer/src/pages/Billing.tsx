import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Table,
  Button,
  Space,
  Modal,
  Form,
  Select,
  DatePicker,
  message,
  Typography,
  Tag,
  notification,
  Input,
  Card,
  Divider,
  InputNumber,
  Alert,
  Tabs,
  Progress,
  List
} from 'antd'
import {
  FilePdfOutlined,
  PlusOutlined,
  FolderOpenOutlined,
  DeleteOutlined,
  InfoCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined
} from '@ant-design/icons'
import dayjs from 'dayjs'
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter'
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore'

dayjs.extend(isSameOrAfter)
dayjs.extend(isSameOrBefore)

import { MaintenanceLetter, Project, LetterAddOn } from '@preload/types'

const { Title, Text } = Typography
const { Option } = Select
const { TabPane } = Tabs
const { Search } = Input

interface PdfProgress {
  current: number
  total: number
  completed: Array<{ id: number; path: string; success: boolean }>
}

const Billing: React.FC = () => {
  const [letters, setLetters] = useState<MaintenanceLetter[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedProject, setSelectedProject] = useState<number | null>(null)
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null)

  // Default to current financial year
  const currentYear = dayjs().month() < 3 ? dayjs().year() - 1 : dayjs().year()
  const defaultFY = `${currentYear}-${(currentYear + 1).toString().slice(2)}`
  const [selectedYear, setSelectedYear] = useState<string | null>(defaultFY)

  const [selectedUnitType, setSelectedUnitType] = useState<string | null>(null)
  const [amountRange, setAmountRange] = useState<[number | null, number | null]>([null, null])
  const [dueDateRange, setDueDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([
    null,
    null
  ])

  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [searchText, setSearchText] = useState('')
  const [addOnsModalVisible, setAddOnsModalVisible] = useState(false)
  const [currentLetterAddOns, setCurrentLetterAddOns] = useState<LetterAddOn[]>([])
  const [currentLetter, setCurrentLetter] = useState<MaintenanceLetter | null>(null)
  const [form] = Form.useForm()
  const location = useLocation()
  const [passedUnitIds, setPassedUnitIds] = useState<number[]>([])
  
  // PDF generation state
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [pdfProgress, setPdfProgress] = useState<PdfProgress | null>(null)
  const [selectedUnitIds, setSelectedUnitIds] = useState<number[]>([])
  const [batchModalStep, setBatchModalStep] = useState<'config' | 'units'>('config')

  const fetchData = async (): Promise<void> => {
    setLoading(true)
    try {
      const [lettersData, projectsData] = await Promise.all([
        window.api.letters.getAll(),
        window.api.projects.getAll()
      ])
      setLetters(lettersData)
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
    // Handle navigation shortcuts from Units page
    const state = location.state as { unitId?: number; unitIds?: number[] }
    if (state) {
      if (state.unitId) {
        setPassedUnitIds([state.unitId])
        setIsModalOpen(true)
      } else if (state.unitIds && state.unitIds.length > 0) {
        setPassedUnitIds(state.unitIds as number[])
        setIsModalOpen(true)
      }
      // Clear navigation state to prevent re-triggering on refresh
      window.history.replaceState({}, document.title)
    }
  }, [location])

  // Calculate filter statistics
  const filterStats = useMemo(() => {
    const pending = letters.filter(l => l.status === 'Pending').length
    const paid = letters.filter(l => l.status === 'Paid').length
    const overdue = letters.filter(l => 
      l.status === 'Pending' && l.due_date && dayjs(l.due_date).isBefore(dayjs())
    ).length
    
    return { pending, paid, overdue }
  }, [letters])

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return searchText || 
           selectedProject !== null || 
           selectedYear !== null || 
           selectedStatus !== null || 
           selectedUnitType !== null || 
           amountRange[0] !== null || 
           amountRange[1] !== null || 
           dueDateRange[0] !== null || 
           dueDateRange[1] !== null
  }, [searchText, selectedProject, selectedYear, selectedStatus, selectedUnitType, amountRange, dueDateRange])

  // Clear all filters
  const clearAllFilters = useCallback(() => {
    setSearchText('')
    setSelectedProject(null)
    setSelectedYear(defaultFY)
    setSelectedStatus(null)
    setSelectedUnitType(null)
    setAmountRange([null, null])
    setDueDateRange([null, null])
    setSelectedRowKeys([])
  }, [defaultFY])

  const handleBatchGenerate = (): void => {
    setPassedUnitIds([])
    setSelectedUnitIds([])
    setBatchModalStep('config')
    form.resetFields()
    setIsModalOpen(true)
  }

  const handleShowAddOns = async (record: MaintenanceLetter): Promise<void> => {
    if (!record.id) return
    try {
      setLoading(true)
      const data = await window.api.letters.getAddOns(record.id)
      setCurrentLetterAddOns(data)
      setCurrentLetter(record)
      setAddOnsModalVisible(true)
    } catch {
      message.error('Failed to fetch add-ons')
    } finally {
      setLoading(false)
    }
  }

  const handleModalOk = async (): Promise<void> => {
    if (batchModalStep === 'config') {
      // Validate configuration step
      try {
        await form.validateFields(['project_id', 'financial_year', 'letter_date', 'due_date'])
        const projectId = form.getFieldValue('project_id')
        if (projectId) {
          // Move to unit selection step
          setBatchModalStep('units')
        }
      } catch {
        // Validation will show errors
      }
    } else {
      // Generate letters
      try {
        const values = await form.validateFields()
        const { project_id, financial_year, letter_date, due_date, add_ons } = values

        const letterDate = letter_date.format('YYYY-MM-DD')
        const dueDate = due_date.format('YYYY-MM-DD')

        setLoading(true)
        await window.api.letters.createBatch({
          projectId: project_id,
          unitIds: selectedUnitIds.length > 0 ? selectedUnitIds : undefined,
          financialYear: financial_year,
          letterDate,
          dueDate,
          addOns: (add_ons || []).map((ao: { addon_name: string; addon_amount: number }) => ({
            addon_name: ao.addon_name,
            addon_amount: ao.addon_amount
          }))
        })
        message.success('Maintenance letters generated successfully')
        setIsModalOpen(false)
        setBatchModalStep('config')
        fetchData()
      } catch (error: unknown) {
        console.error(error)
        const messageText = error instanceof Error ? error.message : String(error)
        const errorMessage = messageText.includes('Error:')
          ? messageText.split('Error:')[1].trim()
          : messageText || 'Failed to generate maintenance letters'
        message.error(errorMessage)
      } finally {
        setLoading(false)
      }
    }
  }

  const handleViewPdf = async (id: number): Promise<void> => {
    try {
      message.loading({ content: 'Generating Letter...', key: 'pdf_gen' })
      const path = await window.api.letters.generatePdf(id)
      message.success({ content: 'Maintenance Letter generated successfully!', key: 'pdf_gen' })
      notification.success({
        message: 'Letter Ready',
        description: `Maintenance Letter has been saved.`,
        btn: (
          <Button
            type="primary"
            size="small"
            icon={<FolderOpenOutlined />}
            onClick={() => window.api.shell.showItemInFolder(path)}
          >
            Show in Folder
          </Button>
        ),
        placement: 'bottomRight'
      })
    } catch {
      message.error({ content: 'Failed to generate letter', key: 'pdf_gen' })
    }
  }

  const handleBatchPdf = async (): Promise<void> => {
    if (selectedRowKeys.length === 0) {
      message.warning('Please select letters to generate PDFs for')
      return
    }

    setGeneratingPdf(true)
    setPdfProgress({
      current: 0,
      total: selectedRowKeys.length,
      completed: []
    })

    const letterIds = selectedRowKeys as number[]
    
    for (let i = 0; i < letterIds.length; i++) {
      try {
        const path = await window.api.letters.generatePdf(letterIds[i])
        setPdfProgress(prev => prev ? {
          ...prev,
          current: i + 1,
          completed: [...prev.completed, { id: letterIds[i], path, success: true }]
        } : null)
      } catch {
        setPdfProgress(prev => prev ? {
          ...prev,
          current: i + 1,
          completed: [...prev.completed, { id: letterIds[i], path: '', success: false }]
        } : null)
      }
    }

    setGeneratingPdf(false)
    
    // Show summary notification
    if (pdfProgress) {
      const successCount = pdfProgress.completed.filter(c => c.success).length
      const failCount = pdfProgress.completed.filter(c => !c.success).length
      
      notification.info({
        message: 'Batch PDF Generation Complete',
        description: (
          <div>
            <div>Successfully generated: {successCount} letters</div>
            {failCount > 0 && <div>Failed: {failCount} letters</div>}
          </div>
        ),
        duration: 5
      })
    }
  }

  const handleDelete = async (id: number): Promise<void> => {
    Modal.confirm({
      title: 'Are you sure you want to delete this maintenance letter?',
      content: 'This action cannot be undone.',
      okText: 'Yes, Delete',
      okType: 'danger',
      cancelText: 'No',
      onOk: async () => {
        await window.api.letters.delete(id)
        message.success('Maintenance letter deleted')
        fetchData()
      }
    })
  }

  const handleBulkDelete = async (): Promise<void> => {
    Modal.confirm({
      title: `Are you sure you want to delete ${selectedRowKeys.length} maintenance letters?`,
      content: 'This action cannot be undone.',
      okText: 'Yes, Delete',
      okType: 'danger',
      cancelText: 'No',
      onOk: async () => {
        setLoading(true)
        try {
          await window.api.letters.bulkDelete(selectedRowKeys as number[])
          message.success(`Successfully deleted ${selectedRowKeys.length} maintenance letters`)
          fetchData()
          setSelectedRowKeys([])
        } catch {
          message.error('Failed to delete maintenance letters')
        } finally {
          setLoading(false)
        }
      }
    })
  }

  const filteredLetters = letters.filter((letter) => {
    const matchProject = !selectedProject || letter.project_id === selectedProject
    const matchYear = !selectedYear || letter.financial_year === selectedYear
    const matchSearch =
      !searchText ||
      letter.unit_number?.toLowerCase().includes(searchText.toLowerCase()) ||
      letter.owner_name?.toLowerCase().includes(searchText.toLowerCase())

    // Status Logic: Pending (is_paid=0), Paid (is_paid=1), Overdue (pending + past due)
    const letterDueDate = letter.due_date ? dayjs(letter.due_date) : null
    const isOverdue = letter.status === 'Pending' && letterDueDate && letterDueDate.isBefore(dayjs())
    
    const matchStatus =
      !selectedStatus ||
      (selectedStatus === 'Paid' && letter.status === 'Paid') ||
      (selectedStatus === 'Pending' && letter.status === 'Pending' && !isOverdue) ||
      (selectedStatus === 'Overdue' && isOverdue)

    const matchUnitType = !selectedUnitType || letter.unit_type === selectedUnitType

    const matchMinAmount = amountRange[0] === null || letter.final_amount >= amountRange[0]
    const matchMaxAmount = amountRange[1] === null || letter.final_amount <= amountRange[1]

    const matchMinDueDate =
      !dueDateRange[0] || (letterDueDate && letterDueDate.isSameOrAfter(dueDateRange[0], 'day'))
    const matchMaxDueDate =
      !dueDateRange[1] || (letterDueDate && letterDueDate.isSameOrBefore(dueDateRange[1], 'day'))

    return (
      matchProject &&
      matchYear &&
      matchSearch &&
      matchStatus &&
      matchUnitType &&
      matchMinAmount &&
      matchMaxAmount &&
      matchMinDueDate &&
      matchMaxDueDate
    )
  })

  const uniqueYears = useMemo(() => {
    return Array.from(new Set(letters.map((l) => l.financial_year)))
      .sort()
      .reverse()
  }, [letters])

  // Get selected project name
  const selectedProjectName = useMemo(() => {
    if (!selectedProject) return ''
    const project = projects.find(p => p.id === selectedProject)
    return project?.name || ''
  }, [selectedProject, projects])

  const columns = [
    {
      title: 'Unit',
      dataIndex: 'unit_number',
      key: 'unit_number',
      sorter: (a: MaintenanceLetter, b: MaintenanceLetter) =>
        (a.unit_number || '').localeCompare(b.unit_number || '')
    },
    {
      title: 'Type',
      dataIndex: 'unit_type',
      key: 'unit_type',
      width: 120
    },
    {
      title: 'FY',
      dataIndex: 'financial_year',
      key: 'financial_year',
      sorter: (a: MaintenanceLetter, b: MaintenanceLetter) =>
        a.financial_year.localeCompare(b.financial_year)
    },
    {
      title: 'Amount',
      dataIndex: 'base_amount',
      key: 'base_amount',
      align: 'right' as const,
      render: (val: number) => `₹${(val || 0).toLocaleString()}`
    },
    {
      title: 'Add-ons',
      dataIndex: 'add_ons_total',
      key: 'add_ons_total',
      align: 'right' as const,
      render: (val: number) => (
        <Button type="link" size="small">
          ₹{(val || 0).toLocaleString()}
        </Button>
      ),
      onCell: (record: MaintenanceLetter) => ({
        onClick: (e) => {
          e.stopPropagation()
          handleShowAddOns(record)
        }
      })
    },
    {
      title: 'Final',
      dataIndex: 'final_amount',
      key: 'final_amount',
      align: 'right' as const,
      render: (val: number) => <strong>₹{(val || 0).toLocaleString()}</strong>,
      sorter: (a: MaintenanceLetter, b: MaintenanceLetter) => a.final_amount - b.final_amount
    },
    {
      title: 'Letter Date',
      dataIndex: 'letter_date',
      key: 'letter_date',
      render: (date: string) => date || '-'
    },
    {
      title: 'Due Date',
      dataIndex: 'due_date',
      key: 'due_date',
      render: (date: string) => {
        const dueDate = date ? dayjs(date) : null
        const isOverdue = dueDate && dueDate.isBefore(dayjs())
        return (
          <div>
            {date || '-'}
            {isOverdue && <Tag color="red" style={{ marginLeft: 4 }}>Overdue</Tag>}
          </div>
        )
      }
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string, record: MaintenanceLetter) => {
        const isOverdue = status === 'Pending' && record.due_date && dayjs(record.due_date).isBefore(dayjs())
        const tagColor = isOverdue ? 'red' : status === 'Paid' ? 'green' : 'orange'
        const tagText = isOverdue ? 'Overdue' : status
        return <Tag color={tagColor}>{tagText}</Tag>
      }
    },
    {
      title: 'Actions',
      key: 'actions',
      align: 'right' as const,
      fixed: 'right' as const,
      render: (_: unknown, record: MaintenanceLetter) => (
        <Space size="middle">
          <Button
            type="primary"
            icon={<FilePdfOutlined />}
            size="small"
            onClick={(e) => {
              e.stopPropagation()
              record.id && handleViewPdf(record.id)
            }}
          >
            PDF
          </Button>
          <Button
            icon={<DeleteOutlined />}
            size="small"
            danger
            onClick={(e) => {
              e.stopPropagation()
              record.id && handleDelete(record.id)
            }}
          />
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
          <Title level={4} style={{ margin: 0 }}>
            Maintenance Letters
          </Title>
          <Space>
            {selectedRowKeys.length > 0 && (
              <>
                <Button 
                  type="primary" 
                  icon={<FilePdfOutlined />} 
                  onClick={handleBatchPdf}
                  loading={generatingPdf}
                >
                  Generate PDFs ({selectedRowKeys.length})
                </Button>
                <Button danger icon={<DeleteOutlined />} onClick={handleBulkDelete}>
                  Delete Selected ({selectedRowKeys.length})
                </Button>
              </>
            )}
            <Button type="primary" icon={<PlusOutlined />} onClick={handleBatchGenerate}>
              Generate Batch
            </Button>
          </Space>
        </div>

        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Space wrap size="middle">
            <Search
              placeholder="Search Unit / Owner..."
              style={{ width: 250 }}
              allowClear
              onSearch={setSearchText}
              onChange={(e) => setSearchText(e.target.value)}
              value={searchText}
            />
            <Select
              placeholder="Project"
              style={{ width: 200 }}
              allowClear
              onChange={setSelectedProject}
              value={selectedProject}
            >
              {projects.map((p) => (
                <Option key={p.id} value={p.id}>
                  {p.name}
                </Option>
              ))}
            </Select>
            <Select
              placeholder="Financial Year"
              style={{ width: 150 }}
              allowClear
              onChange={setSelectedYear}
              value={selectedYear}
            >
              {uniqueYears.map((year) => (
                <Option key={year} value={year}>
                  {year}
                </Option>
              ))}
            </Select>
            <Select
              placeholder="Status"
              style={{ width: 150 }}
              allowClear
              onChange={setSelectedStatus}
              value={selectedStatus}
            >
              <Option value="Pending">
                <Space>
                  <span>Pending</span>
                  <Tag color="orange">
                    {filterStats.pending}
                  </Tag>
                </Space>
              </Option>
              <Option value="Paid">
                <Space>
                  <span>Paid</span>
                  <Tag color="green">
                    {filterStats.paid}
                  </Tag>
                </Space>
              </Option>
              <Option value="Overdue">
                <Space>
                  <span>Overdue</span>
                  <Tag color="red">
                    {filterStats.overdue}
                  </Tag>
                </Space>
              </Option>
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
          </Space>

          <Space wrap size="middle">
            <Space>
              <Text type="secondary">Amount Range:</Text>
              <InputNumber
                placeholder="Min"
                style={{ width: 100 }}
                value={amountRange[0]}
                onChange={(min) => {
                  if (amountRange[1] && min && min > amountRange[1]) {
                    message.warning('Minimum amount cannot exceed maximum')
                    return
                  }
                  setAmountRange([min, amountRange[1]])
                }}
                min={0}
              />
              <Text>-</Text>
              <InputNumber
                placeholder="Max"
                style={{ width: 100 }}
                value={amountRange[1]}
                onChange={(max) => {
                  if (amountRange[0] && max && max < amountRange[0]) {
                    message.warning('Maximum amount cannot be less than minimum')
                    return
                  }
                  setAmountRange([amountRange[0], max])
                }}
                min={0}
              />
            </Space>
            <Space>
              <Text type="secondary">Due Date Range:</Text>
              <DatePicker.RangePicker
                style={{ width: 250 }}
                value={[dueDateRange[0], dueDateRange[1]]}
                onChange={(dates) => setDueDateRange(dates ? [dates[0], dates[1]] : [null, null])}
                format="DD/MM/YYYY"
              />
            </Space>
          </Space>

          {/* Filter Summary Chips */}
          {hasActiveFilters && (
            <div style={{ marginTop: 16, padding: '12px 16px', background: '#fafafa', borderRadius: 6 }}>
              <Space wrap align="center">
                <Text type="secondary" style={{ fontSize: '12px', fontWeight: 500 }}>
                  Active filters:
                </Text>
                {searchText && (
                  <Tag
                  closable
                  onClose={() => setSearchText('')}>
                  Search: &quot;{searchText}&quot;
                </Tag>
                )}
                {selectedProject !== null && (
                  <Tag 
                  closable 
                  onClose={() => setSelectedProject(null)} >
                  Project: {selectedProjectName}
                </Tag>
                )}
                {selectedYear !== null && selectedYear !== defaultFY && (
                  <Tag 
                  closable 
                  onClose={() => setSelectedYear(defaultFY)} >
                  FY: {selectedYear}
                </Tag>
                )}
                {selectedStatus && (
                  <Tag 
                  closable 
                  onClose={() => setSelectedStatus(null)} >
                  Status: {selectedStatus}
                </Tag>
                )}
                {selectedUnitType && (
                  <Tag 
                  closable 
                  onClose={() => setSelectedUnitType(null)} >
                  Type: {selectedUnitType}
                </Tag>
                )}
                {(amountRange[0] !== null || amountRange[1] !== null) && (
                  <Tag 
                  closable 
                  onClose={() => setAmountRange([null, null])}>
                  Amount: {amountRange[0] !== null ? `₹${amountRange[0]}` : 'Any'} - {amountRange[1] !== null ? `₹${amountRange[1]}` : 'Any'}
                </Tag>
                )}
                {(dueDateRange[0] || dueDateRange[1]) && (
                  <Tag 
                  closable 
                  onClose={() => setDueDateRange([null, null])}>
                  Due: {dueDateRange[0]?.format('DD/MM/YY') || 'Any'} to {dueDateRange[1]?.format('DD/MM/YY') || 'Any'}
                </Tag>
                )}
                <Button 
                  type="link" 
                  size="small" 
                  onClick={clearAllFilters}
                  style={{ fontSize: '12px', padding: 0, height: 'auto' }}
                >
                  Clear all filters
                </Button>
              </Space>
            </div>
          )}
        </Space>
      </Card>

      {/* Batch PDF Generation Progress Modal */}
      <Modal
        title="Generating PDFs"
        open={generatingPdf}
        onCancel={() => setGeneratingPdf(false)}
        footer={[
          <Button 
            key="cancel" 
            onClick={() => setGeneratingPdf(false)}
            disabled={pdfProgress?.current === pdfProgress?.total}
          >
            Cancel
          </Button>
        ]}
        closable={false}
        width={500}
      >
        {pdfProgress && (
          <div>
            <Progress
              percent={Math.round((pdfProgress.current / pdfProgress.total) * 100)}
              status="active"
              style={{ marginBottom: 16 }}
            />
            <Text>
              Generating {pdfProgress.current} of {pdfProgress.total} PDFs
            </Text>
            
            {pdfProgress.completed.length > 0 && (
              <div style={{ marginTop: 16, maxHeight: 200, overflow: 'auto' }}>
                <List
                  size="small"
                  dataSource={pdfProgress.completed}
                  renderItem={(item) => (
                    <List.Item>
                      <List.Item.Meta
                        avatar={
                          item.success ? (
                            <CheckCircleOutlined style={{ color: '#52c41a' }} />
                          ) : (
                            <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                          )
                        }
                        title={`Letter ${item.id}`}
                        description={item.success ? 'Generated successfully' : 'Failed to generate'}
                      />
                    </List.Item>
                  )}
                />
              </div>
            )}
          </div>
        )}
      </Modal>

      <Table
        rowSelection={{
          selectedRowKeys,
          onChange: setSelectedRowKeys
        }}
        columns={columns}
        dataSource={filteredLetters}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
        rowClassName={(record) => {
          const isOverdue = record.status === 'Pending' && 
                           record.due_date && 
                           dayjs(record.due_date).isBefore(dayjs())
          return isOverdue ? 'overdue-row' : !record.is_paid ? 'pending-row' : ''
        }}
        onRow={(record) => ({
          onClick: () => handleShowAddOns(record),
          style: { cursor: 'pointer' }
        })}
      />

      <Modal
        title="Generate Batch Maintenance Letters"
        open={isModalOpen}
        onOk={handleModalOk}
        onCancel={() => {
          setIsModalOpen(false)
          setBatchModalStep('config')
        }}
        width={700}
        confirmLoading={loading}
        okText={batchModalStep === 'config' ? 'Next: Select Units' : 'Generate Letters'}
      >
        {passedUnitIds.length > 0 && (
          <Alert
            message={`Generating letters for ${passedUnitIds.length} selected unit(s)`}
            type="info"
            showIcon
            icon={<InfoCircleOutlined />}
            style={{ marginBottom: 16 }}
            closable
            onClose={() => setPassedUnitIds([])}
          />
        )}
        
        <Tabs 
          activeKey={batchModalStep} 
          onChange={(key) => setBatchModalStep(key as 'config' | 'units')}
          style={{ marginBottom: 16 }}
        >
          <TabPane tab="1. Configuration" key="config">
            <Form
              form={form}
              layout="vertical"
              initialValues={{
                letter_date: dayjs(),
                due_date: dayjs().add(15, 'day'),
                financial_year: selectedYear || defaultFY
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <Form.Item
                  name="project_id"
                  label="Select Project"
                  rules={[{ required: true, message: 'Please select project' }]}
                  style={{ gridColumn: 'span 2' }}
                >
                  <Select placeholder="Select a project">
                    {projects.map((p) => (
                      <Option key={p.id} value={p.id}>
                        {p.name}
                      </Option>
                    ))}
                  </Select>
                </Form.Item>

                <Form.Item
                  name="financial_year"
                  label="Financial Year (e.g., 2024-25)"
                  rules={[{ required: true, message: 'Please enter financial year' }]}
                  style={{ gridColumn: 'span 2' }}
                >
                  <Input placeholder="2024-25" />
                </Form.Item>

                <Form.Item
                  name="letter_date"
                  label="Letter Date"
                  rules={[{ required: true, message: 'Please select letter date' }]}
                >
                  <DatePicker style={{ width: '100%' }} />
                </Form.Item>

                <Form.Item
                  name="due_date"
                  label="Due Date"
                  rules={[{ required: true, message: 'Please select due date' }]}
                >
                  <DatePicker style={{ width: '100%' }} />
                </Form.Item>

                <Divider style={{ gridColumn: 'span 2', margin: '8px 0' }}>Add-ons (Optional)</Divider>

                <Form.List name="add_ons">
                  {(fields, { add, remove }) => (
                    <div style={{ gridColumn: 'span 2' }}>
                      {fields.map(({ key, name, ...restField }) => (
                        <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                          <Form.Item
                            {...restField}
                            name={[name, 'addon_name']}
                            rules={[{ required: true, message: 'Name required' }]}
                          >
                            <Input placeholder="Addon Name (e.g. Penalty)" />
                          </Form.Item>
                          <Form.Item
                            {...restField}
                            name={[name, 'addon_amount']}
                            rules={[{ required: true, message: 'Amount required' }]}
                          >
                            <InputNumber placeholder="Amount" style={{ width: 120 }} prefix="₹" />
                          </Form.Item>
                          <Form.Item {...restField} name={[name, 'remarks']}>
                            <Input placeholder="Remarks" />
                          </Form.Item>
                          <Button
                            type="text"
                            danger
                            onClick={() => remove(name)}
                            icon={<DeleteOutlined />}
                          />
                        </Space>
                      ))}
                      <Form.Item>
                        <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                          Add Item
                        </Button>
                      </Form.Item>
                    </div>
                  )}
                </Form.List>
              </div>
            </Form>
          </TabPane>
          
          <TabPane tab="2. Select Units (Optional)" key="units" disabled={!form.getFieldValue('project_id')}>
            <Alert
              message="Select specific units to generate letters for, or leave empty to generate for all units in the project"
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
            <Text type="secondary">
              Unit selection is optional. If no units are selected, letters will be generated for all active units in the project.
            </Text>
          </TabPane>
        </Tabs>
      </Modal>

      <Modal
        title={`Add-ons Breakdown: ${currentLetter?.unit_number} (${currentLetter?.financial_year})`}
        open={addOnsModalVisible}
        onCancel={() => setAddOnsModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setAddOnsModalVisible(false)}>
            Close
          </Button>
        ]}
        width={600}
      >
        <Table
          dataSource={currentLetterAddOns}
          pagination={false}
          rowKey="id"
          columns={[
            { title: 'Description', dataIndex: 'addon_name', key: 'addon_name' },
            {
              title: 'Amount',
              dataIndex: 'addon_amount',
              key: 'addon_amount',
              align: 'right',
              render: (val: number) => `₹${val.toLocaleString()}`
            },
            { title: 'Remarks', dataIndex: 'remarks', key: 'remarks' }
          ]}
          summary={(pageData) => {
            let total = 0
            pageData.forEach(({ addon_amount }) => (total += addon_amount))
            return (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0}>
                  <strong>Total Add-ons</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  <strong>₹{total.toLocaleString()}</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2} />
              </Table.Summary.Row>
            )
          }}
        />
      </Modal>
    </div>
  )
}

export default Billing
