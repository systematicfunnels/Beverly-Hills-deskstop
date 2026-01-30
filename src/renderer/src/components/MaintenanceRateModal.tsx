import React, { useState, useEffect, useCallback } from 'react'
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
  Card
} from 'antd'
import { PlusOutlined, DeleteOutlined, PercentageOutlined } from '@ant-design/icons'
import { MaintenanceRate, MaintenanceSlab } from '@preload/types'

interface MaintenanceRateModalProps {
  projectId: number
  projectName: string
  visible: boolean
  onCancel: () => void
}

const { Option } = Select

const MaintenanceRateModal: React.FC<MaintenanceRateModalProps> = ({
  projectId,
  projectName,
  visible,
  onCancel
}) => {
  const [rates, setRates] = useState<MaintenanceRate[]>([])
  const [loading, setLoading] = useState(false)
  const [isAddingRate, setIsAddingRate] = useState(false)
  const [selectedRateId, setSelectedRateId] = useState<number | null>(null)
  const [slabs, setSlabs] = useState<MaintenanceSlab[]>([])
  const [isAddingSlab, setIsAddingSlab] = useState(false)

  const [rateForm] = Form.useForm()
  const [slabForm] = Form.useForm()

  const fetchRates = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const data = await window.api.rates.getByProject(projectId)
      setRates(data)
    } catch {
      message.error('Failed to fetch rates')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (visible && projectId) {
      fetchRates()
    }
  }, [visible, projectId, fetchRates])

  const handleAddRate = async (): Promise<void> => {
    try {
      const values = await rateForm.validateFields()
      await window.api.rates.create({
        ...values,
        project_id: projectId
      })
      message.success('Rate added successfully')
      setIsAddingRate(false)
      rateForm.resetFields()
      fetchRates()
    } catch {
      // Form validation error or API error
    }
  }

  const handleDeleteRate = async (id: number): Promise<void> => {
    try {
      await window.api.rates.delete(id)
      message.success('Rate deleted successfully')
      fetchRates()
      if (selectedRateId === id) {
        setSelectedRateId(null)
        setSlabs([])
      }
    } catch {
      message.error('Failed to delete rate')
    }
  }

  const handleViewSlabs = async (rateId: number): Promise<void> => {
    setSelectedRateId(rateId)
    try {
      const data = await window.api.rates.getSlabs(rateId)
      setSlabs(data)
    } catch {
      message.error('Failed to fetch slabs')
    }
  }

  const handleAddSlab = async (): Promise<void> => {
    if (!selectedRateId) return
    try {
      const values = await slabForm.validateFields()
      await window.api.rates.addSlab({
        ...values,
        rate_id: selectedRateId,
        is_early_payment: true
      })
      message.success('Slab added successfully')
      setIsAddingSlab(false)
      slabForm.resetFields()
      handleViewSlabs(selectedRateId)
    } catch {
      // Form validation error or API error
    }
  }

  const handleDeleteSlab = async (id: number): Promise<void> => {
    try {
      await window.api.rates.deleteSlab(id)
      message.success('Slab deleted successfully')
      if (selectedRateId) handleViewSlabs(selectedRateId)
    } catch {
      message.error('Failed to delete slab')
    }
  }

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
      title: 'Rate (per Sqft)',
      dataIndex: 'rate_per_sqft',
      key: 'rate_per_sqft',
      render: (val: number): string => `₹${val.toFixed(2)}`
    },
    {
      title: 'Frequency',
      dataIndex: 'billing_frequency',
      key: 'billing_frequency',
      render: (val: string): React.ReactNode => <Tag color="blue">{val}</Tag>
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: unknown, record: MaintenanceRate): React.ReactNode => (
        <Space>
          <Button
            size="small"
            icon={<PercentageOutlined />}
            onClick={() => handleViewSlabs(record.id!)}
            type={selectedRateId === record.id ? 'primary' : 'default'}
          >
            Slabs
          </Button>
          <Popconfirm title="Delete this rate?" onConfirm={() => handleDeleteRate(record.id!)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
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
      render: (date: string): string => new Date(date).toLocaleDateString()
    },
    {
      title: 'Discount %',
      dataIndex: 'discount_percentage',
      key: 'discount_percentage',
      render: (val: number): string => `${val}%`
    },
    {
      title: 'Action',
      key: 'action',
      render: (_: unknown, record: MaintenanceSlab): React.ReactNode => (
        <Popconfirm title="Delete this slab?" onConfirm={() => handleDeleteSlab(record.id!)}>
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      )
    }
  ]

  return (
    <Modal
      title={`Maintenance Rates - ${projectName}`}
      open={visible}
      onCancel={onCancel}
      footer={null}
      width={900}
    >
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h3>Rates</h3>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setIsAddingRate(true)}
          disabled={isAddingRate}
        >
          Add Rate
        </Button>
      </div>

      {isAddingRate && (
        <Card size="small" style={{ marginBottom: 16, backgroundColor: '#fafafa' }}>
          <Form form={rateForm} layout="inline" onFinish={handleAddRate}>
            <Form.Item
              name="financial_year"
              label="FY"
              rules={[{ required: true, message: 'Required' }]}
            >
              <Input placeholder="2024-25" style={{ width: 100 }} />
            </Form.Item>
            <Form.Item name="unit_type" label="Type" initialValue="Bungalow">
              <Select style={{ width: 120 }}>
                <Option value="Plot">Plot</Option>
                <Option value="Bungalow">Bungalow</Option>
              </Select>
            </Form.Item>
            <Form.Item
              name="rate_per_sqft"
              label="Rate"
              rules={[{ required: true, message: 'Required' }]}
            >
              <InputNumber min={0} placeholder="Rate" style={{ width: 100 }} />
            </Form.Item>
            <Form.Item name="billing_frequency" label="Freq" initialValue="YEARLY">
              <Select style={{ width: 120 }}>
                <Option value="YEARLY">Yearly</Option>
                <Option value="MONTHLY">Monthly</Option>
                <Option value="QUARTERLY">Quarterly</Option>
                <Option value="HALFYEARLY">Half-Yearly</Option>
              </Select>
            </Form.Item>
            <Form.Item>
              <Space>
                <Button type="primary" htmlType="submit">
                  Save
                </Button>
                <Button onClick={() => setIsAddingRate(false)}>Cancel</Button>
              </Space>
            </Form.Item>
          </Form>
        </Card>
      )}

      <Table
        dataSource={rates}
        columns={rateColumns}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 5 }}
      />

      {selectedRateId && (
        <>
          <Divider />
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
            <h3>Early Payment Slabs (Discounts)</h3>
            <Button
              type="dashed"
              icon={<PlusOutlined />}
              onClick={() => setIsAddingSlab(true)}
              disabled={isAddingSlab}
            >
              Add Slab
            </Button>
          </div>

          {isAddingSlab && (
            <Card size="small" style={{ marginBottom: 16, backgroundColor: '#fafafa' }}>
              <Form form={slabForm} layout="inline" onFinish={handleAddSlab}>
                <Form.Item
                  name="due_date"
                  label="Due Date"
                  rules={[{ required: true, message: 'Required' }]}
                >
                  <Input type="date" />
                </Form.Item>
                <Form.Item
                  name="discount_percentage"
                  label="Discount %"
                  rules={[{ required: true, message: 'Required' }]}
                >
                  <InputNumber min={0} max={100} placeholder="%" style={{ width: 80 }} />
                </Form.Item>
                <Form.Item>
                  <Space>
                    <Button type="primary" htmlType="submit">
                      Save
                    </Button>
                    <Button onClick={() => setIsAddingSlab(false)}>Cancel</Button>
                  </Space>
                </Form.Item>
              </Form>
            </Card>
          )}

          <Table
            dataSource={slabs}
            columns={slabColumns}
            rowKey="id"
            size="small"
            pagination={false}
          />
        </>
      )}
    </Modal>
  )
}

export default MaintenanceRateModal
