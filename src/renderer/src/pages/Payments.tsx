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
  Input,
  InputNumber,
  Tag,
  Typography,
  Divider,
  Card,
  DividerProps,
  Progress,
  Alert
} from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  PrinterOutlined,
  TableOutlined,
  CalculatorOutlined,
  ClearOutlined,
  InfoCircleOutlined
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { Project, Unit, Payment, MaintenanceLetter } from '@preload/types'

const { Title, Text } = Typography
const { Option } = Select
const { Search } = Input

interface BulkPaymentEntry {
  unit_id: number
  project_id: number
  unit_number: string
  owner_name: string
  payment_amount: number
  payment_mode: string
  payment_date: dayjs.Dayjs
}

interface ReceiptProgress {
  current: number
  total: number
}

const Payments: React.FC = () => {
  const [payments, setPayments] = useState<Payment[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [letters, setLetters] = useState<MaintenanceLetter[]>([])
  const [loading, setLoading] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false)
  const [selectedProject, setSelectedProject] = useState<number | null>(null)
  const [selectedMode, setSelectedMode] = useState<string | null>(null)

  // Default to current financial year
  const currentYear = dayjs().month() < 3 ? dayjs().year() - 1 : dayjs().year()
  const defaultFY = `${currentYear}-${(currentYear + 1).toString().slice(2)}`
  const [selectedFY, setSelectedFY] = useState<string | null>(defaultFY)

  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [searchText, setSearchText] = useState('')
  const [form] = Form.useForm()
  const [bulkForm] = Form.useForm()
  const location = useLocation()

  const [bulkPayments, setBulkPayments] = useState<BulkPaymentEntry[]>([])
  const [bulkProject, setBulkProject] = useState<number | null>(null)
  const [generatingReceipts, setGeneratingReceipts] = useState(false)
  const [receiptProgress, setReceiptProgress] = useState<ReceiptProgress | null>(null)

  const fetchData = async (): Promise<void> => {
    setLoading(true)
    try {
      const [paymentsData, unitsData, lettersData, projectsData] = await Promise.all([
        window.api.payments.getAll(),
        window.api.units.getAll(),
        window.api.letters.getAll(),
        window.api.projects.getAll()
      ])
      setPayments(paymentsData)
      setUnits(unitsData)
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
  const state = location.state as { unitId?: number }
  if (state?.unitId) {
    const checkUnits = setInterval(() => {
      if (units.length > 0) {
        const foundUnit = units.find((u) => u.id === state.unitId)
        if (foundUnit) {
          form.resetFields()
          form.setFieldsValue({
            unit_id: foundUnit.id,
            project_id: foundUnit.project_id
          })
          setIsModalOpen(true)
        }
        clearInterval(checkUnits)
      }
    }, 100)
    // Clear navigation state to prevent re-triggering on refresh
    window.history.replaceState({}, document.title)
    return () => clearInterval(checkUnits)
  }
  return undefined
}, [location, units, form])

  // Get unique financial years for filtering
  const uniqueFinancialYears = useMemo(() => {
    const years = Array.from(new Set(payments.map((p) => p.financial_year).filter(Boolean)))
      .sort()
      .reverse()
    if (!years.includes(defaultFY)) {
      years.unshift(defaultFY)
    }
    return years
  }, [payments, defaultFY])

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return (
      searchText ||
      selectedProject !== null ||
      selectedFY !== defaultFY ||
      selectedMode !== null
    )
  }, [searchText, selectedProject, selectedFY, selectedMode, defaultFY])

  // Get selected project name
  const selectedProjectName = useMemo(() => {
    if (!selectedProject) return ''
    const project = projects.find((p) => p.id === selectedProject)
    return project?.name || ''
  }, [selectedProject, projects])

  // Clear all filters
  const clearAllFilters = useCallback(() => {
    setSearchText('')
    setSelectedProject(null)
    setSelectedFY(defaultFY)
    setSelectedMode(null)
    setSelectedRowKeys([])
  }, [defaultFY])

  const handleAdd = (): void => {
    form.resetFields()
    setIsModalOpen(true)
  }

  const handleBulkAdd = (): void => {
    bulkForm.resetFields()
    setBulkPayments([])
    setBulkProject(null)
    setIsBulkModalOpen(true)
  }

  const handleBulkProjectChange = useCallback((projectId: number): void => {
    setBulkProject(projectId)
    const projectUnits = units.filter((u) => u.project_id === projectId)
    const paymentMode = bulkForm.getFieldValue('payment_mode') || 'Transfer'
    const paymentDate = bulkForm.getFieldValue('payment_date') || dayjs()
    
    setBulkPayments(
      projectUnits.map((u) => ({
        unit_id: u.id as number,
        project_id: u.project_id,
        unit_number: u.unit_number,
        owner_name: u.owner_name,
        payment_amount: 0,
        payment_mode: paymentMode,
        payment_date: paymentDate
      }))
    )
  }, [units, bulkForm])

  const handleSetSameAmount = useCallback(() => {
    const amountStr = prompt('Enter amount to apply to all units:')
    if (amountStr) {
      const amount = Number.parseFloat(amountStr)
      if (!Number.isNaN(amount) && amount >= 0) {
        setBulkPayments((prev) =>
          prev.map((p) => ({ ...p, payment_amount: amount }))
        )
      } else {
        message.warning('Please enter a valid number')
      }
    }
  }, [])

  const handleClearAllAmounts = useCallback(() => {
    setBulkPayments((prev) => prev.map((p) => ({ ...p, payment_amount: 0 })))
  }, [])

  const handleBulkModalOk = async (): Promise<void> => {
    try {
      const values = await bulkForm.validateFields()
      const validPayments = bulkPayments
        .filter((p) => p.payment_amount > 0)
        .map((p) => ({
          unit_id: p.unit_id,
          project_id: p.project_id,
          payment_amount: p.payment_amount,
          financial_year: values.financial_year,
          payment_mode: p.payment_mode,
          payment_date: values.payment_date.format('YYYY-MM-DD'),
          cheque_number: values.reference_number,
          remarks: values.remarks
        }))

      if (validPayments.length === 0) {
        message.warning('Please enter amount for at least one unit')
        return
      }

      setLoading(true)
      for (const payment of validPayments) {
        await window.api.payments.create(payment as Payment)
      }
      message.success(`Successfully recorded ${validPayments.length} payments`)
      setIsBulkModalOpen(false)
      fetchData()
    } catch (error) {
      console.error('Failed to record bulk payments:', error)
      message.error('Failed to record bulk payments')
    } finally {
      setLoading(false)
    }
  }

  const handleModalOk = async (): Promise<void> => {
    try {
      const values = await form.validateFields()
      const selectedUnit = units.find((u) => u.id === values.unit_id)
      if (!selectedUnit) {
        message.error('Selected unit not found')
        return
      }

      // If a letter is selected, use its financial year as default if not explicitly set
      let finalFinancialYear = values.financial_year
      if (!finalFinancialYear && values.letter_id) {
        const selectedLetter = letters.find((l) => l.id === values.letter_id)
        if (selectedLetter) {
          finalFinancialYear = selectedLetter.financial_year
        }
      }

      const paymentData = {
        ...values,
        financial_year: finalFinancialYear,
        cheque_number: values.reference_number,
        project_id: selectedUnit.project_id,
        payment_date: values.payment_date.format('YYYY-MM-DD')
      }

      setLoading(true)
      await window.api.payments.create(paymentData)
      message.success('Payment recorded successfully')
      setIsModalOpen(false)
      fetchData()
    } catch (error) {
      console.error('Failed to record payment:', error)
      message.error('Failed to record payment')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: number): Promise<void> => {
    Modal.confirm({
      title: 'Are you sure you want to delete this payment?',
      onOk: async (): Promise<void> => {
        await window.api.payments.delete(id)
        message.success('Payment deleted')
        fetchData()
      }
    })
  }

  const handleBulkDelete = async (): Promise<void> => {
    Modal.confirm({
      title: `Are you sure you want to delete ${selectedRowKeys.length} payments?`,
      content: 'This action cannot be undone.',
      okText: 'Yes, Delete',
      okType: 'danger',
      cancelText: 'No',
      onOk: async (): Promise<void> => {
        setLoading(true)
        try {
          await window.api.payments.bulkDelete(selectedRowKeys as number[])
          message.success(`Successfully deleted ${selectedRowKeys.length} payments`)
          fetchData()
          setSelectedRowKeys([])
        } catch (error) {
          console.error('Failed to delete payments:', error)
          message.error('Failed to delete payments')
        } finally {
          setLoading(false)
        }
      }
    })
  }

  const handlePrintReceipt = async (id: number): Promise<void> => {
    try {
      setLoading(true)
      const pdfPath = await window.api.payments.generateReceiptPdf(id)
      await window.api.shell.showItemInFolder(pdfPath)
    } catch (error) {
      console.error('Failed to generate receipt:', error)
      message.error('Failed to generate receipt')
    } finally {
      setLoading(false)
    }
  }

  const handleBatchReceipts = async (): Promise<void> => {
    if (selectedRowKeys.length === 0) {
      message.warning('Please select payments to generate receipts for')
      return
    }

    setGeneratingReceipts(true)
    setReceiptProgress({ current: 0, total: selectedRowKeys.length })

    const paymentIds = selectedRowKeys as number[]
    let successCount = 0
    let failCount = 0

    for (let i = 0; i < paymentIds.length; i++) {
      try {
        await window.api.payments.generateReceiptPdf(paymentIds[i])
        successCount++
      } catch {
        failCount++
      }
      setReceiptProgress((prev) =>
        prev ? { ...prev, current: i + 1 } : null
      )
    }

    setGeneratingReceipts(false)
    setReceiptProgress(null)

    if (failCount === 0) {
      message.success(`Successfully generated ${successCount} receipts`)
    } else {
      message.warning(
        `Generated ${successCount} receipts, failed to generate ${failCount}`
      )
    }
  }

  const columns = [
    {
      title: 'Unit',
      dataIndex: 'unit_number',
      key: 'unit_number',
      sorter: (a: Payment, b: Payment) =>
        (a.unit_number || '').localeCompare(b.unit_number || '')
    },
    {
      title: 'Date',
      dataIndex: 'payment_date',
      key: 'payment_date',
      render: (date: string) => dayjs(date).format('DD-MM-YYYY'),
      sorter: (a: Payment, b: Payment) =>
        dayjs(a.payment_date).unix() - dayjs(b.payment_date).unix()
    },
    {
      title: 'Amount',
      dataIndex: 'payment_amount',
      key: 'payment_amount',
      align: 'right' as const,
      render: (val: number) => <strong>₹{val.toLocaleString()}</strong>,
      sorter: (a: Payment, b: Payment) => a.payment_amount - b.payment_amount
    },
    {
      title: 'Mode',
      dataIndex: 'payment_mode',
      key: 'payment_mode',
      align: 'center' as const,
      render: (mode: string) => <Tag color="blue">{mode}</Tag>
    },
    {
      title: 'Ref #',
      dataIndex: 'cheque_number',
      key: 'cheque_number',
      render: (text: string) => text || '-'
    },
    {
      title: 'Against',
      dataIndex: 'financial_year',
      key: 'financial_year',
      align: 'center' as const,
      render: (fy: string) => fy || <Text type="secondary">N/A</Text>
    },
    {
      title: 'Actions',
      key: 'actions',
      align: 'right' as const,
      render: (_: unknown, record: Payment) => (
        <Space>
          <Button
            size="small"
            type="primary"
            icon={<PrinterOutlined />}
            onClick={() => record.id && handlePrintReceipt(record.id)}
            title="Receipt"
          >
            Receipt
          </Button>
          <Button
            size="small"
            icon={<DeleteOutlined />}
            danger
            onClick={() => record.id && handleDelete(record.id)}
            title="Delete"
          />
        </Space>
      )
    }
  ]

  const filteredPayments = payments.filter((payment) => {
    const matchSearch =
      !searchText ||
      (payment.unit_number || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (payment.owner_name || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (payment.receipt_number || '').toLowerCase().includes(searchText.toLowerCase())
    const matchProject =
      !selectedProject ||
      projects.find((s) => s.id === selectedProject)?.name === payment.project_name
    const matchMode = !selectedMode || payment.payment_mode === selectedMode
    const matchFY = !selectedFY || payment.financial_year === selectedFY
    return matchSearch && matchProject && matchMode && matchFY
  })

  // Calculate bulk payment summary
  const bulkPaymentSummary = useMemo(() => {
    const unitsWithAmount = bulkPayments.filter((p) => p.payment_amount > 0).length
    const totalAmount = bulkPayments.reduce((sum, p) => sum + p.payment_amount, 0)
    const averageAmount = bulkPayments.length > 0 
      ? Math.round(totalAmount / bulkPayments.length) 
      : 0
    
    return {
      unitsWithAmount,
      totalAmount,
      averageAmount,
      totalUnits: bulkPayments.length
    }
  }, [bulkPayments])

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
          Payments & Receipts
        </Title>
        <Space>
          {selectedRowKeys.length > 0 && (
            <>
              <Button
                type="primary"
                icon={<PrinterOutlined />}
                onClick={handleBatchReceipts}
                loading={generatingReceipts}
              >
                Batch Receipts ({selectedRowKeys.length})
              </Button>
              <Button danger icon={<DeleteOutlined />} onClick={handleBulkDelete}>
                Delete Selected ({selectedRowKeys.length})
              </Button>
            </>
          )}
          <Button icon={<TableOutlined />} onClick={handleBulkAdd}>
            Bulk Record
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            Record Payment
          </Button>
        </Space>
      </div>

      <Card>
        <div style={{ marginBottom: 24 }}>
          <Space wrap size="middle">
            <Search
              placeholder="Search receipt, unit, owner..."
              allowClear
              onChange={(e) => setSearchText(e.target.value)}
              onSearch={setSearchText}
              style={{ width: 250 }}
              enterButton
              suffix={null}
              value={searchText}
            />
            <Select
              placeholder="Project"
              style={{ width: 200 }}
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
              placeholder="Financial Year"
              style={{ width: 150 }}
              allowClear
              onChange={setSelectedFY}
              value={selectedFY}
            >
              {uniqueFinancialYears.map((fy) => (
                <Option key={fy} value={fy}>
                  {fy}
                </Option>
              ))}
            </Select>
            <Select
              placeholder="Mode"
              style={{ width: 180 }}
              allowClear
              onChange={setSelectedMode}
              value={selectedMode}
            >
              <Option value="Transfer">Bank Transfer / UPI</Option>
              <Option value="Cheque">Cheque</Option>
              <Option value="Cash">Cash</Option>
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
                  <Tag closable onClose={() => setSearchText('')}>
                    Search: &quot;{searchText}&quot;
                  </Tag>
                )}
                {selectedProject !== null && (
                  <Tag closable onClose={() => setSelectedProject(null)}>
                    Project: {selectedProjectName}
                  </Tag>
                )}
                {selectedFY !== null && selectedFY !== defaultFY && (
                  <Tag closable onClose={() => setSelectedFY(defaultFY)}>
                    FY: {selectedFY}
                  </Tag>
                )}
                {selectedMode !== null && (
                  <Tag closable onClose={() => setSelectedMode(null)}>
                    Mode: {selectedMode}
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
          dataSource={filteredPayments}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 'max-content' }}
        />
      </Card>

      {/* Batch Receipt Generation Progress Modal */}
      <Modal
        title="Generating Receipts"
        open={generatingReceipts}
        onCancel={() => setGeneratingReceipts(false)}
        footer={[
          <Button
            key="cancel"
            onClick={() => setGeneratingReceipts(false)}
            disabled={receiptProgress?.current === receiptProgress?.total}
          >
            Cancel
          </Button>
        ]}
        closable={false}
        width={500}
      >
        {receiptProgress && (
          <div>
            <Progress
              percent={Math.round((receiptProgress.current / receiptProgress.total) * 100)}
              status="active"
              style={{ marginBottom: 16 }}
            />
            <Text>
              Generating {receiptProgress.current} of {receiptProgress.total} receipts
            </Text>
          </div>
        )}
      </Modal>

      {/* Record Single Payment Modal */}
      <Modal
        title="Record New Payment"
        open={isModalOpen}
        onOk={handleModalOk}
        onCancel={() => setIsModalOpen(false)}
        confirmLoading={loading}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ payment_date: dayjs(), payment_mode: 'Transfer' }}
        >
          <Divider orientation={'left' as DividerProps['orientation']} style={{ marginTop: 0 }}>
            Unit Details
          </Divider>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <Form.Item
              name="unit_id"
              label="Select Unit"
              rules={[{ required: true, message: 'Please select a unit' }]}
              style={{ gridColumn: 'span 2' }}
            >
              <Select
            showSearch
            placeholder="Search Unit"
            filterOption={(input, option) => {
              if (!option || !option.children) {
                return false;
              }
              const optionText = String(option.children);
              return optionText.toLowerCase().includes(input.toLowerCase());
            }}
            onChange={() => {
              form.setFieldsValue({ letter_id: undefined })
            }}
          >
            {units.map((u) => (
              <Option key={u.id} value={u.id}>
                {u.project_name} - {u.unit_number} ({u.owner_name})
              </Option>
            ))}
          </Select>
        </Form.Item>

            <Form.Item
              noStyle
              shouldUpdate={(prevValues, currentValues) =>
                prevValues.unit_id !== currentValues.unit_id ||
                prevValues.letter_id !== currentValues.letter_id
              }
            >
              {({ getFieldValue }) => {
                const unitId = getFieldValue('unit_id')
                const letterId = getFieldValue('letter_id')
                const unitLetters = letters.filter((l) => l.unit_id === unitId)
                const selectedLetter = unitLetters.find((l) => l.id === letterId)

                return (
                  <>
                    <Form.Item
                      name="letter_id"
                      label="Against Maintenance Letter"
                      extra={
                        <div style={{ fontSize: '12px' }}>
                          {unitLetters.length === 0
                            ? 'No maintenance letters found for this unit'
                            : 'Selecting a letter will automatically set the financial year and amount'}
                        </div>
                      }
                      style={{ gridColumn: 'span 1' }}
                    >
                      <Select
                        placeholder="Select Maintenance Letter"
                        allowClear
                        disabled={unitLetters.length === 0}
                        onChange={(val) => {
                          if (val) {
                            const letter = unitLetters.find((l) => l.id === val)
                            if (letter) {
                              form.setFieldsValue({
                                financial_year: letter.financial_year,
                                payment_amount: letter.final_amount
                              })
                            }
                          }
                        }}
                      >
                        {unitLetters.map((letter) => (
                          <Option key={letter.id} value={letter.id}>
                            FY {letter.financial_year} - ₹{letter.final_amount} ({letter.status})
                          </Option>
                        ))}
                      </Select>
                    </Form.Item>

                    <Form.Item
                      name="financial_year"
                      label="Against Financial Year"
                      rules={[{ required: true, message: 'Please select a financial year' }]}
                      style={{ gridColumn: 'span 1' }}
                    >
                      <Select
                        placeholder="Select Financial Year"
                        disabled={!!selectedLetter}
                      >
                        {Array.from(new Set(letters.map((l) => l.financial_year)))
                          .sort()
                          .reverse()
                          .map((fy) => (
                            <Option key={fy} value={fy}>
                              {fy}
                            </Option>
                          ))}
                        <Option value="2024-25">2024-25</Option>
                        <Option value="2025-26">2025-26</Option>
                        <Option value="2026-27">2026-27</Option>
                      </Select>
                    </Form.Item>
                  </>
                )
              }}
            </Form.Item>
          </div>

          <Divider orientation={'left' as DividerProps['orientation']}>Payment Details</Divider>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <Form.Item
              name="payment_date"
              label="Payment Date"
              rules={[{ required: true, message: 'Please select payment date' }]}
            >
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="payment_amount"
              label="Amount (₹)"
              rules={[
                { required: true, message: 'Please enter amount' },
                { type: 'number', min: 1, message: 'Amount must be greater than 0' }
              ]}
            >
              <InputNumber style={{ width: '100%' }} min={1} />
            </Form.Item>

            <Form.Item
              name="payment_mode"
              label="Payment Mode"
              rules={[{ required: true, message: 'Please select payment mode' }]}
            >
              <Select>
                <Option value="Transfer">Bank Transfer / UPI</Option>
                <Option value="Cheque">Cheque</Option>
                <Option value="Cash">Cash</Option>
              </Select>
            </Form.Item>
            <Form.Item name="reference_number" label="Ref # (UTR/Cheque No)">
              <Input />
            </Form.Item>

            <Form.Item name="remarks" label="Remarks" style={{ gridColumn: 'span 2' }}>
              <Input.TextArea rows={2} />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      {/* Bulk Payment Modal */}
      <Modal
        title="Bulk Payment Entry"
        open={isBulkModalOpen}
        onOk={handleBulkModalOk}
        onCancel={() => setIsBulkModalOpen(false)}
        confirmLoading={loading}
        width={1000}
        okText="Record Payments"
      >
        <Form form={bulkForm} layout="vertical">
          <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
            <Form.Item label="Project" style={{ flex: 1 }} required>
              <Select
                placeholder="Select Project"
                onChange={handleBulkProjectChange}
                value={bulkProject}
              >
                {projects.map((s) => (
                  <Option key={s.id} value={s.id}>
                    {s.name}
                  </Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item
              name="payment_date"
              label="Payment Date"
              initialValue={dayjs()}
              style={{ flex: 1 }}
              rules={[{ required: true, message: 'Please select payment date' }]}
            >
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="financial_year"
              label="Financial Year"
              rules={[{ required: true, message: 'Please select financial year' }]}
              style={{ flex: 1 }}
            >
              <Select placeholder="Select Year">
                {Array.from(new Set(letters.map((l) => l.financial_year)))
                  .sort()
                  .reverse()
                  .map((fy) => (
                    <Option key={fy} value={fy}>
                      {fy}
                    </Option>
                  ))}
                <Option value="2024-25">2024-25</Option>
                <Option value="2025-26">2025-26</Option>
              </Select>
            </Form.Item>
            <Form.Item
              name="payment_mode"
              label="Default Mode"
              initialValue="Transfer"
              style={{ flex: 1 }}
            >
              <Select
                onChange={(val) =>
                  setBulkPayments((prev) =>
                    prev.map((p) => ({ ...p, payment_mode: val }))
                  )
                }
              >
                <Option value="Transfer">Bank Transfer / UPI</Option>
                <Option value="Cheque">Cheque</Option>
                <Option value="Cash">Cash</Option>
              </Select>
            </Form.Item>
          </div>

          {bulkProject && (
            <>
              <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
                <Text type="secondary">Quick actions:</Text>
                <Button
                  size="small"
                  icon={<CalculatorOutlined />}
                  onClick={handleSetSameAmount}
                >
                  Set Same Amount
                </Button>
                <Button
                  size="small"
                  icon={<InfoCircleOutlined />}
                  onClick={() => {
                    message.info('Calculate from letters feature coming soon')
                  }}
                >
                  Calculate from Letters
                </Button>
                <Button
                  size="small"
                  danger
                  icon={<ClearOutlined />}
                  onClick={handleClearAllAmounts}
                >
                  Clear All Amounts
                </Button>
              </div>

              <Table
                dataSource={bulkPayments}
                pagination={false}
                scroll={{ y: 400 }}
                rowKey="unit_id"
                columns={[
                  { title: 'Unit #', dataIndex: 'unit_number', key: 'unit_number', width: 100 },
                  { title: 'Owner', dataIndex: 'owner_name', key: 'owner_name' },
                  {
                    title: 'Amount (₹)',
                    key: 'amount',
                    width: 150,
                    render: (_: unknown, record: BulkPaymentEntry, index: number) => (
                      <InputNumber
                        min={0}
                        style={{ width: '100%' }}
                        value={record.payment_amount}
                        onChange={(val) => {
                          const newPayments = [...bulkPayments]
                          newPayments[index].payment_amount = val || 0
                          setBulkPayments(newPayments)
                        }}
                      />
                    )
                  },
                  {
                    title: 'Mode',
                    key: 'mode',
                    width: 150,
                    render: (_: unknown, record: BulkPaymentEntry, index: number) => (
                      <Select
                        style={{ width: '100%' }}
                        value={record.payment_mode}
                        onChange={(val) => {
                          const newPayments = [...bulkPayments]
                          newPayments[index].payment_mode = val
                          setBulkPayments(newPayments)
                        }}
                      >
                        <Option value="Transfer">Transfer</Option>
                        <Option value="Cheque">Cheque</Option>
                        <Option value="Cash">Cash</Option>
                      </Select>
                    )
                  }
                ]}
              />

              {/* Bulk Payment Summary */}
              {bulkPayments.length > 0 && (
                <div
                  style={{
                    marginTop: 16,
                    padding: '12px 16px',
                    background: '#f6ffed',
                    borderRadius: 4,
                    border: '1px solid #b7eb8f'
                  }}
                >
                  <Space size="large">
                    <Text strong>
                      Units with amount: {bulkPaymentSummary.unitsWithAmount} / {bulkPaymentSummary.totalUnits}
                    </Text>
                    <Text strong type="success">
                      Total Amount: ₹{bulkPaymentSummary.totalAmount.toLocaleString()}
                    </Text>
                    <Text type="secondary">
                      Average: ₹{bulkPaymentSummary.averageAmount.toLocaleString()}
                    </Text>
                  </Space>
                </div>
              )}

              <div style={{ marginTop: '16px', display: 'flex', gap: '16px' }}>
                <Form.Item name="reference_number" label="Common Ref # (Optional)" style={{ flex: 1 }}>
                  <Input placeholder="UTR / Cheque No" />
                </Form.Item>
                <Form.Item name="remarks" label="Common Remarks (Optional)" style={{ flex: 1 }}>
                  <Input />
                </Form.Item>
              </div>
            </>
          )}

          {!bulkProject && (
            <Alert
              message="Select a project to start bulk payment entry"
              type="info"
              showIcon
              style={{ marginTop: 16 }}
            />
          )}
        </Form>
      </Modal>
    </div>
  )
}

export default Payments
