import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Modal,
  Table,
  Button,
  Form,
  Input,
  InputNumber,
  Space,
  message,
  Divider,
  Select,
  Popconfirm,
  Tag,
  Card,
  Typography,
  Alert,
  Tooltip
} from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  PercentageOutlined,
  EditOutlined,
  FilterOutlined
} from '@ant-design/icons'
import { MaintenanceRate, MaintenanceSlab } from '@preload/types'

interface MaintenanceRateModalProps {
  projectId: number
  projectName: string
  visible: boolean
  onCancel: () => void
}

const { Option } = Select
const { Text, Title } = Typography

interface RateFormValues {
  financial_year: string
  unit_type: string
  rate_per_sqft: number
  billing_frequency: string
}

interface SlabFormValues {
  due_date: string
  discount_percentage: number
}

const MaintenanceRateModal: React.FC<MaintenanceRateModalProps> = ({
  projectId,
  projectName,
  visible,
  onCancel
}) => {
  const [rates, setRates] = useState<MaintenanceRate[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingSlabs, setLoadingSlabs] = useState(false)
  const [isAddingRate, setIsAddingRate] = useState(false)
  const [editingRateId, setEditingRateId] = useState<number | null>(null)
  const [selectedRate, setSelectedRate] = useState<MaintenanceRate | null>(null)
  const [slabs, setSlabs] = useState<MaintenanceSlab[]>([])
  const [isAddingSlab, setIsAddingSlab] = useState(false)
  const [filterFY, setFilterFY] = useState<string | null>(null)
  const [filterUnitType, setFilterUnitType] = useState<string>('All')

  const [rateForm] = Form.useForm<RateFormValues>()
  const [slabForm] = Form.useForm<SlabFormValues>()

  const fetchRates = useCallback(async (): Promise<void> => {
    if (!projectId) return

    setLoading(true)
    try {
      const data = await window.api.rates.getByProject(projectId)
      setRates(data || [])
    } catch (error) {
      console.error('Failed to fetch rates:', error)
      message.error('Failed to fetch rates')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (visible && projectId) {
      fetchRates()
      // Reset selections when modal opens
      setSelectedRate(null)
      setSlabs([])
      setIsAddingRate(false)
      setEditingRateId(null)
      setIsAddingSlab(false)
      rateForm.resetFields()
      slabForm.resetFields()
    }
  }, [visible, projectId, fetchRates, rateForm, slabForm])

  const fyOptions = useMemo(() => {
    const years = Array.from(
      new Set(rates.map((r) => r.financial_year).filter(Boolean))
    ) as string[]
    return years.sort().reverse()
  }, [rates])

  const filteredRates = useMemo(() => {
    return rates.filter((r) => {
      const fyOk = !filterFY || r.financial_year === filterFY
      const typeOk = filterUnitType === 'All' || (r.unit_type || 'Bungalow') === filterUnitType
      return fyOk && typeOk
    })
  }, [rates, filterFY, filterUnitType])

  // Check for duplicate rates before saving
  const checkDuplicateRate = useCallback(
    (financial_year: string, unit_type: string, excludeId?: number): boolean => {
      return rates.some(
        (rate) =>
          rate.financial_year === financial_year &&
          rate.unit_type === unit_type &&
          rate.id !== excludeId
      )
    },
    [rates]
  )

  const handleSaveRate = async (): Promise<void> => {
    try {
      const values = await rateForm.validateFields()

      // Check for duplicate
      const isDuplicate = checkDuplicateRate(
        values.financial_year,
        values.unit_type || 'Bungalow',
        editingRateId || undefined
      )

      if (isDuplicate) {
        message.error('A rate with this Financial Year and Unit Type already exists')
        return
      }

      setLoading(true)
      if (editingRateId) {
        await window.api.rates.update(editingRateId, {
          ...values,
          unit_type: values.unit_type || 'Bungalow',
          billing_frequency: values.billing_frequency || 'YEARLY'
        })
        message.success('Rate updated successfully')
      } else {
        await window.api.rates.create({
          ...values,
          unit_type: values.unit_type || 'Bungalow',
          billing_frequency: values.billing_frequency || 'YEARLY',
          project_id: projectId
        } as MaintenanceRate)
        message.success('Rate added successfully')
      }

      setIsAddingRate(false)
      setEditingRateId(null)
      rateForm.resetFields()
      fetchRates()
    } catch (error) {
      console.error('Failed to save rate:', error)
      // Form validation error or API error
    } finally {
      setLoading(false)
    }
  }

  const handleEditRate = (rate: MaintenanceRate): void => {
    setEditingRateId(rate.id ?? null)
    setIsAddingRate(true)
    rateForm.setFieldsValue({
      financial_year: rate.financial_year,
      unit_type: rate.unit_type || 'Bungalow',
      rate_per_sqft: rate.rate_per_sqft,
      billing_frequency: rate.billing_frequency || 'YEARLY'
    })
  }

  const handleDeleteRate = async (id: number): Promise<void> => {
    try {
      await window.api.rates.delete(id)
      message.success('Rate deleted successfully')
      fetchRates()
      if (selectedRate?.id === id) {
        setSelectedRate(null)
        setSlabs([])
      }
      if (editingRateId === id) {
        setIsAddingRate(false)
        setEditingRateId(null)
        rateForm.resetFields()
      }
    } catch (error) {
      console.error('Failed to delete rate:', error)
      message.error('Failed to delete rate')
    }
  }

  const handleViewSlabs = async (rate: MaintenanceRate): Promise<void> => {
    setSelectedRate(rate)
    setLoadingSlabs(true)
    try {
      const data = await window.api.rates.getSlabs(rate.id!)
      setSlabs(data || [])
    } catch (error) {
      console.error('Failed to fetch slabs:', error)
      message.error('Failed to fetch slabs')
    } finally {
      setLoadingSlabs(false)
    }
  }

  const handleAddSlab = async (): Promise<void> => {
    if (!selectedRate) {
      message.warning('Please select a rate first')
      return
    }

    try {
      const values = await slabForm.validateFields()

      // Validate due date is not in the past
      const dueDate = new Date(values.due_date)
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      if (dueDate < today) {
        message.warning('Due date cannot be in the past')
        return
      }

      setLoadingSlabs(true)
      await window.api.rates.addSlab({
        ...values,
        rate_id: selectedRate.id!,
        is_early_payment: true
      } as MaintenanceSlab)

      message.success('Slab added successfully')
      setIsAddingSlab(false)
      slabForm.resetFields()
      handleViewSlabs(selectedRate)
    } catch (error) {
      console.error('Failed to add slab:', error)
      // Form validation error or API error
    } finally {
      setLoadingSlabs(false)
    }
  }

  const handleDeleteSlab = async (id: number): Promise<void> => {
    try {
      await window.api.rates.deleteSlab(id)
      message.success('Slab deleted successfully')
      if (selectedRate) handleViewSlabs(selectedRate)
    } catch (error) {
      console.error('Failed to delete slab:', error)
      message.error('Failed to delete slab')
    }
  }

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return filterFY !== null || filterUnitType !== 'All'
  }, [filterFY, filterUnitType])

  // Clear all filters
  const clearAllFilters = useCallback(() => {
    setFilterFY(null)
    setFilterUnitType('All')
  }, [])

  // Format billing frequency for display
  const formatBillingFrequency = useCallback((frequency: string): string => {
    const frequencyMap: Record<string, string> = {
      YEARLY: 'Yearly',
      MONTHLY: 'Monthly',
      QUARTERLY: 'Quarterly',
      HALFYEARLY: 'Half-Yearly'
    }
    return frequencyMap[frequency] || frequency
  }, [])

  const rateColumns = [
    {
      title: 'Financial Year',
      dataIndex: 'financial_year',
      key: 'financial_year'
    },
    {
      title: 'Unit Type',
      dataIndex: 'unit_type',
      key: 'unit_type',
      render: (val: string): React.ReactNode => <Tag>{val || 'Bungalow'}</Tag>
    },
    {
      title: 'Rate per Sqft',
      dataIndex: 'rate_per_sqft',
      key: 'rate_per_sqft',
      render: (val: number): string => `₹${val?.toFixed(2) || '0.00'}`
    },
    {
      title: 'Billing Frequency',
      dataIndex: 'billing_frequency',
      key: 'billing_frequency',
      render: (val: string): React.ReactNode => (
        <Tag color="blue">{formatBillingFrequency(val)}</Tag>
      )
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: unknown, record: MaintenanceRate): React.ReactNode => (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEditRate(record)}
            aria-label={`Edit ${record.financial_year} ${record.unit_type || 'Bungalow'} rate`}
          >
            Edit
          </Button>
          <Button
            size="small"
            icon={<PercentageOutlined />}
            onClick={() => handleViewSlabs(record)}
            type={selectedRate?.id === record.id ? 'primary' : 'default'}
            loading={selectedRate?.id === record.id && loadingSlabs}
            aria-label={`View slabs for ${record.financial_year} ${record.unit_type || 'Bungalow'}`}
          >
            Slabs
          </Button>
          <Popconfirm
            title="Are you sure you want to delete this rate?"
            description="This action cannot be undone."
            onConfirm={() => handleDeleteRate(record.id!)}
            okText="Yes"
            cancelText="No"
          >
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              aria-label={`Delete ${record.financial_year} ${record.unit_type || 'Bungalow'} rate`}
            />
          </Popconfirm>
        </Space>
      )
    }
  ]

  const slabColumns = [
    {
      title: 'Due Date',
      dataIndex: 'due_date',
      key: 'due_date',
      render: (date: string): string => {
        if (!date) return '-'
        return new Date(date).toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        })
      }
    },
    {
      title: 'Discount Percentage',
      dataIndex: 'discount_percentage',
      key: 'discount_percentage',
      render: (val: number): string => `${val}%`
    },
    {
      title: 'Action',
      key: 'action',
      render: (_: unknown, record: MaintenanceSlab): React.ReactNode => (
        <Popconfirm
          title="Are you sure you want to delete this slab?"
          description="This action cannot be undone."
          onConfirm={() => handleDeleteSlab(record.id!)}
          okText="Yes"
          cancelText="No"
        >
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            aria-label={`Delete slab with ${record.discount_percentage}% discount due ${record.due_date}`}
          />
        </Popconfirm>
      )
    }
  ]

  const handleCancelRateForm = (): void => {
    setIsAddingRate(false)
    setEditingRateId(null)
    rateForm.resetFields()
  }

  const handleCancelSlabForm = (): void => {
    setIsAddingSlab(false)
    slabForm.resetFields()
  }

  return (
    <Modal
      title={`Maintenance Rates - ${projectName}`}
      open={visible}
      onCancel={onCancel}
      footer={null}
      width={900}
      style={{ maxWidth: '95vw' }}
      destroyOnClose
    >
      <div style={{ marginBottom: 24 }}>
        <Alert
          message={`Managing rates for: ${projectName}`}
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
            flexWrap: 'wrap',
            gap: '16px'
          }}
        >
          <Title level={4} style={{ margin: 0 }}>
            Rates
          </Title>
          <Space wrap>
            <Select
              placeholder="Financial Year"
              style={{ width: 140 }}
              allowClear
              onChange={setFilterFY}
              value={filterFY}
              suffixIcon={<FilterOutlined />}
              aria-label="Filter by financial year"
            >
              {fyOptions.map((fy) => (
                <Option key={fy} value={fy}>
                  {fy}
                </Option>
              ))}
            </Select>
            <Select
              placeholder="Unit Type"
              style={{ width: 140 }}
              allowClear
              onChange={(val) => setFilterUnitType(val ?? 'All')}
              value={filterUnitType}
              suffixIcon={<FilterOutlined />}
              aria-label="Filter by unit type"
            >
              <Option value="All">All</Option>
              <Option value="Plot">Plot</Option>
              <Option value="Bungalow">Bungalow</Option>
            </Select>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditingRateId(null)
                rateForm.resetFields()
                rateForm.setFieldsValue({
                  unit_type: 'Bungalow',
                  billing_frequency: 'YEARLY'
                })
                setIsAddingRate(true)
              }}
              disabled={isAddingRate}
            >
              Add Rate
            </Button>
          </Space>
        </div>

        {/* Filter Summary Chips */}
        {hasActiveFilters && (
          <div style={{ marginBottom: 16 }}>
            <Space wrap>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                Active filters:
              </Text>
              {filterFY && (
                <Tag
                  closable
                  onClose={() => setFilterFY(null)}
                  aria-label={`Financial year filter: ${filterFY}`}
                >
                  FY: {filterFY}
                </Tag>
              )}
              {filterUnitType !== 'All' && (
                <Tag
                  closable
                  onClose={() => setFilterUnitType('All')}
                  aria-label={`Unit type filter: ${filterUnitType}`}
                >
                  Type: {filterUnitType}
                </Tag>
              )}
              <Button
                type="link"
                size="small"
                onClick={clearAllFilters}
                style={{ fontSize: '12px', padding: 0, height: 'auto' }}
                aria-label="Clear all filters"
              >
                Clear all
              </Button>
            </Space>
          </div>
        )}

        {isAddingRate && (
          <Card size="small" style={{ marginBottom: 16, backgroundColor: '#fafafa' }}>
            <Form form={rateForm} layout="inline" onFinish={handleSaveRate}>
              <Form.Item<RateFormValues>
                name="financial_year"
                label="Financial Year"
                rules={[
                  { required: true, message: 'Financial Year is required' },
                  { pattern: /^\d{4}-\d{2}$/, message: 'Format: YYYY-YY (e.g., 2024-25)' }
                ]}
                style={{ marginBottom: 8 }}
              >
                <Input
                  placeholder="e.g., 2024-25"
                  style={{ width: 120 }}
                  aria-label="Financial year"
                  maxLength={7}
                />
              </Form.Item>
              <Form.Item<RateFormValues>
                name="unit_type"
                label="Unit Type"
                initialValue="All"
                style={{ marginBottom: 8 }}
              >
                <Select style={{ width: 120 }} aria-label="Unit type">
                  <Option value="All">All</Option>
                  <Option value="Plot">Plot</Option>
                  <Option value="Bungalow">Bungalow</Option>
                </Select>
              </Form.Item>
              <Form.Item<RateFormValues>
                name="rate_per_sqft"
                label="Rate per Sqft"
                rules={[
                  { required: true, message: 'Rate is required' },
                  { type: 'number', min: 0, message: 'Rate must be positive' }
                ]}
                style={{ marginBottom: 8 }}
              >
                <InputNumber
                  min={0}
                  placeholder="0.00"
                  style={{ width: 120 }}
                  aria-label="Rate per square foot"
                  precision={2}
                />
              </Form.Item>
              <Form.Item<RateFormValues>
                name="billing_frequency"
                label="Billing Frequency"
                initialValue="YEARLY"
                style={{ marginBottom: 8 }}
              >
                <Select style={{ width: 140 }} aria-label="Billing frequency">
                  <Option value="YEARLY">Yearly</Option>
                  <Option value="MONTHLY">Monthly</Option>
                  <Option value="QUARTERLY">Quarterly</Option>
                  <Option value="HALFYEARLY">Half-Yearly</Option>
                </Select>
              </Form.Item>
              <Form.Item style={{ marginBottom: 8 }}>
                <Space>
                  <Button type="primary" htmlType="submit" loading={loading}>
                    Save
                  </Button>
                  <Button onClick={handleCancelRateForm}>Cancel</Button>
                </Space>
              </Form.Item>
            </Form>
          </Card>
        )}

        <Table
          dataSource={filteredRates}
          columns={rateColumns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 5, showSizeChanger: false }}
          locale={{
            emptyText: 'No rates found. Click "Add Rate" to create your first rate.'
          }}
          scroll={{ x: 'max-content' }}
        />
      </div>

      {selectedRate && (
        <>
          <Divider />
          <div style={{ marginBottom: 16 }}>
            <Title level={4} style={{ marginBottom: 8 }}>
              Early Payment Slabs
            </Title>
            <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
              Discounts for {selectedRate.financial_year} - {selectedRate.unit_type || 'Bungalow'}{' '}
              rate
            </Text>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
                flexWrap: 'wrap',
                gap: '16px'
              }}
            >
              <Text>
                {slabs.length > 0
                  ? `${slabs.length} slab${slabs.length !== 1 ? 's' : ''} configured`
                  : 'No slabs configured yet'}
              </Text>
              <Tooltip title="Add discount slabs for early payments">
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => setIsAddingSlab(true)}
                  disabled={isAddingSlab}
                >
                  Add Slab
                </Button>
              </Tooltip>
            </div>

            {isAddingSlab && (
              <Card size="small" style={{ marginBottom: 16, backgroundColor: '#fafafa' }}>
                <Form form={slabForm} layout="inline" onFinish={handleAddSlab}>
                  <Form.Item<SlabFormValues>
                    name="due_date"
                    label="Due Date"
                    rules={[{ required: true, message: 'Due date is required' }]}
                    style={{ marginBottom: 8 }}
                  >
                    <Input
                      type="date"
                      aria-label="Slab due date"
                      min={new Date().toISOString().split('T')[0]}
                    />
                  </Form.Item>
                  <Form.Item<SlabFormValues>
                    name="discount_percentage"
                    label="Discount Percentage"
                    rules={[
                      { required: true, message: 'Discount percentage is required' },
                      {
                        type: 'number',
                        min: 0,
                        max: 100,
                        message: 'Discount must be between 0-100%'
                      }
                    ]}
                    style={{ marginBottom: 8 }}
                  >
                    <InputNumber
                      min={0}
                      max={100}
                      placeholder="%"
                      style={{ width: 100 }}
                      aria-label="Discount percentage"
                    />
                  </Form.Item>
                  <Form.Item style={{ marginBottom: 8 }}>
                    <Space>
                      <Button type="primary" htmlType="submit" loading={loadingSlabs}>
                        Save
                      </Button>
                      <Button onClick={handleCancelSlabForm}>Cancel</Button>
                    </Space>
                  </Form.Item>
                </Form>
              </Card>
            )}

            {slabs.length > 0 ? (
              <Table
                dataSource={slabs}
                columns={slabColumns}
                rowKey="id"
                size="small"
                pagination={false}
                loading={loadingSlabs}
                locale={{
                  emptyText: 'No slabs found. Click "Add Slab" to create your first discount slab.'
                }}
              />
            ) : (
              <Alert
                message="No early payment slabs"
                description="Add slabs to offer discounts for payments made before due dates."
                type="info"
                showIcon
              />
            )}
          </div>
        </>
      )}
    </Modal>
  )
}

export default MaintenanceRateModal
