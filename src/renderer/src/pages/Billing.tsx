import React, { useState, useEffect } from 'react'
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
  InputNumber
} from 'antd'
import {
  FilePdfOutlined,
  PlusOutlined,
  FolderOpenOutlined,
  DeleteOutlined
} from '@ant-design/icons'
import dayjs from 'dayjs'
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter'
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore'

dayjs.extend(isSameOrAfter)
dayjs.extend(isSameOrBefore)

import { MaintenanceLetter, Project } from '@preload/types'

const { Title } = Typography
const { Option } = Select
const { Search } = Input

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
  const [selectedWing, setSelectedWing] = useState<string | null>(null)
  const [amountRange, setAmountRange] = useState<[number | null, number | null]>([null, null])
  const [dueDateRange, setDueDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([null, null])

  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [searchText, setSearchText] = useState('')
  const [addOnsModalVisible, setAddOnsModalVisible] = useState(false)
  const [currentLetterAddOns, setCurrentLetterAddOns] = useState<any[]>([])
  const [currentLetter, setCurrentLetter] = useState<MaintenanceLetter | null>(null)
  const [form] = Form.useForm()

  const fetchData = async () => {
    setLoading(true)
    try {
      const [lettersData, projectsData] = await Promise.all([
        window.api.letters.getAll(),
        window.api.projects.getAll()
      ])
      setLetters(lettersData)
      setProjects(projectsData)
      setSelectedRowKeys([])
    } catch (error) {
      message.error('Failed to fetch data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleBatchGenerate = () => {
    form.resetFields()
    setIsModalOpen(true)
  }

  const handleShowAddOns = async (record: MaintenanceLetter) => {
    if (!record.id) return
    try {
      setLoading(true)
      const data = await window.api.letters.getAddOns(record.id)
      setCurrentLetterAddOns(data)
      setCurrentLetter(record)
      setAddOnsModalVisible(true)
    } catch (error) {
      message.error('Failed to fetch add-ons')
    } finally {
      setLoading(false)
    }
  }

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields()
      const { project_id, financial_year, letter_date, due_date, add_ons } = values

      const letterDate = letter_date.format('YYYY-MM-DD')
      const dueDate = due_date.format('YYYY-MM-DD')

      setLoading(true)
      await window.api.letters.createBatch({
        projectId: project_id,
        financialYear: financial_year,
        letterDate,
        dueDate,
        addOns: add_ons || []
      })
      message.success('Maintenance letters generated successfully')
      setIsModalOpen(false)
      fetchData()
    } catch (error: any) {
      console.error(error)
      // Display the specific error message from the backend if available
      const errorMessage = error.message?.includes('Error:') 
        ? error.message.split('Error:')[1].trim() 
        : error.message || 'Failed to generate maintenance letters'
      message.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleViewPdf = async (id: number) => {
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
    } catch (error) {
      message.error({ content: 'Failed to generate letter', key: 'pdf_gen' })
    }
  }

  const handleDelete = async (id: number) => {
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

  const handleBulkDelete = async () => {
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
        } catch (error) {
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
    
    // Status Logic: Pending (is_paid=0), Paid (is_paid=1)
    const matchStatus = !selectedStatus || 
      (selectedStatus === 'Paid' && letter.status === 'Paid') || 
      (selectedStatus === 'Pending' && letter.status === 'Pending')

    const matchUnitType = !selectedUnitType || letter.unit_type === selectedUnitType
    const matchWing = !selectedWing || letter.wing === selectedWing
    
    const matchMinAmount = amountRange[0] === null || letter.final_amount >= amountRange[0]
    const matchMaxAmount = amountRange[1] === null || letter.final_amount <= amountRange[1]
    
    const letterDueDate = letter.due_date ? dayjs(letter.due_date) : null
    const matchMinDueDate = !dueDateRange[0] || (letterDueDate && letterDueDate.isSameOrAfter(dueDateRange[0], 'day'))
    const matchMaxDueDate = !dueDateRange[1] || (letterDueDate && letterDueDate.isSameOrBefore(dueDateRange[1], 'day'))

    return matchProject && matchYear && matchSearch && matchStatus && 
           matchUnitType && matchWing && matchMinAmount && matchMaxAmount &&
           matchMinDueDate && matchMaxDueDate
  })

  const uniqueYears = Array.from(new Set(letters.map((l) => l.financial_year))).sort().reverse()
  const uniqueWings = Array.from(new Set(letters.map((l) => l.wing).filter(Boolean))).sort()

  const columns = [
    {
      title: 'Unit',
      dataIndex: 'unit_number',
      key: 'unit_number',
      sorter: (a: MaintenanceLetter, b: MaintenanceLetter) =>
        (a.unit_number || '').localeCompare(b.unit_number || '')
    },
    {
      title: 'Wing',
      dataIndex: 'wing',
      key: 'wing',
      width: 80
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
          ₹${(val || 0).toLocaleString()}
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
      render: (val: number) => <strong>₹${(val || 0).toLocaleString()}</strong>,
      sorter: (a: MaintenanceLetter, b: MaintenanceLetter) => a.final_amount - b.final_amount
    },
    {
      title: 'Due Date',
      dataIndex: 'due_date',
      key: 'due_date',
      render: (date: string) => date || '-'
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'Paid' ? 'green' : 'orange'}>{status}</Tag>
      )
    },
    {
      title: 'Actions',
      key: 'actions',
      align: 'right' as const,
      fixed: 'right' as const,
      render: (_: any, record: MaintenanceLetter) => (
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
              <Button danger icon={<DeleteOutlined />} onClick={handleBulkDelete}>
                Delete Selected ({selectedRowKeys.length})
              </Button>
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
              style={{ width: 130 }}
              allowClear
              onChange={setSelectedStatus}
              value={selectedStatus}
            >
              <Option value="Pending">Pending</Option>
              <Option value="Paid">Paid</Option>
            </Select>
            <Select
              placeholder="Unit Type"
              style={{ width: 140 }}
              allowClear
              onChange={setSelectedUnitType}
              value={selectedUnitType}
            >
              <Option value="Residential">Residential</Option>
              <Option value="Commercial">Commercial</Option>
              <Option value="Plot">Plot</Option>
              <Option value="Bungalow">Bungalow</Option>
              <Option value="Flat">Flat</Option>
            </Select>
            <Select
              placeholder="Wing"
              style={{ width: 120 }}
              allowClear
              onChange={setSelectedWing}
              value={selectedWing}
            >
              {uniqueWings.map((wing) => (
                <Option key={wing} value={wing}>
                  {wing}
                </Option>
              ))}
            </Select>
          </Space>

          <Space wrap size="middle">
            <Space>
              <Typography.Text type="secondary">Amount Range:</Typography.Text>
              <InputNumber
                placeholder="Min"
                style={{ width: 100 }}
                value={amountRange[0]}
                onChange={(val) => setAmountRange([val, amountRange[1]])}
              />
              <Typography.Text>-</Typography.Text>
              <InputNumber
                placeholder="Max"
                style={{ width: 100 }}
                value={amountRange[1]}
                onChange={(val) => setAmountRange([amountRange[0], val])}
              />
            </Space>
            <Space>
              <Typography.Text type="secondary">Due Date Range:</Typography.Text>
              <DatePicker.RangePicker
                style={{ width: 250 }}
                value={[dueDateRange[0], dueDateRange[1]]}
                onChange={(dates) => setDueDateRange(dates ? [dates[0], dates[1]] : [null, null])}
              />
            </Space>
          </Space>
        </Space>
      </Card>

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
        rowClassName={(record) => (!record.is_paid ? 'pending-row' : '')}
        onRow={(record) => ({
          onClick: () => handleShowAddOns(record),
          style: { cursor: 'pointer' }
        })}
      />

      <Modal
        title="Generate Batch Maintenance Letters"
        open={isModalOpen}
        onOk={handleModalOk}
        onCancel={() => setIsModalOpen(false)}
        width={700}
        confirmLoading={loading}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            letter_date: dayjs(),
            due_date: dayjs().add(15, 'day'),
            financial_year: `${dayjs().year()}-${(dayjs().year() + 1).toString().slice(2)}`
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
