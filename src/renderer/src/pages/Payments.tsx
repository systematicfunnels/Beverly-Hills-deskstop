import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Modal, Form, Select, DatePicker, message, Input, InputNumber, Tag, Typography, Divider, Card } from 'antd';
import { PlusOutlined, DeleteOutlined, PrinterOutlined, TableOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const { Title } = Typography;
const { Option } = Select;
const { Search } = Input;

interface Payment {
  id: number;
  unit_number: string;
  owner_name: string;
  project_name: string;
  payment_date: string;
  payment_amount: number;
  payment_mode: string;
  receipt_number: string;
}

interface Project {
  id: number;
  name: string;
}

interface Unit {
  id: number;
  project_id: number;
  unit_number: string;
  owner_name: string;
  project_name: string;
}

interface MaintenanceLetter {
  id: number;
  unit_id: number;
  final_amount: number;
  financial_year: string;
  status: string;
}

const Payments: React.FC = () => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [letters, setLetters] = useState<MaintenanceLetter[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [bulkProject, setBulkProject] = useState<number | null>(null);
  const [bulkPayments, setBulkPayments] = useState<any[]>([]);
  const [selectedMode, setSelectedMode] = useState<string | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [searchText, setSearchText] = useState('');
  const [form] = Form.useForm();
  const [bulkForm] = Form.useForm();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [paymentsData, unitsData, lettersData, projectsData] = await Promise.all([
        window.api.payments.getAll(),
        window.api.units.getAll(),
        window.api.letters.getAll(),
        window.api.projects.getAll(),
      ]);
      setPayments(paymentsData);
      setUnits(unitsData);
      setLetters(lettersData);
      setProjects(projectsData);
      setSelectedRowKeys([]);
    } catch (error) {
      message.error('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAdd = () => {
    form.resetFields();
    setIsModalOpen(true);
  };

  const handleBulkAdd = () => {
    bulkForm.resetFields();
    setBulkPayments([]);
    setBulkProject(null);
    setIsBulkModalOpen(true);
  };

  const handleBulkProjectChange = (projectId: number) => {
    setBulkProject(projectId);
    const projectUnits = units.filter(u => projects.find(p => p.id === projectId)?.name === u.project_name);
    setBulkPayments(projectUnits.map(u => ({
      unit_id: u.id,
      project_id: u.project_id,
      unit_number: u.unit_number,
      owner_name: u.owner_name,
      payment_amount: 0,
      payment_mode: 'Transfer',
      payment_date: dayjs()
    })));
  };

  const handleBulkModalOk = async () => {
    try {
      const values = await bulkForm.validateFields();
      const validPayments = bulkPayments.filter(p => p.payment_amount > 0).map(p => ({
        unit_id: p.unit_id,
        project_id: p.project_id,
        payment_amount: p.payment_amount,
        payment_mode: p.payment_mode,
        payment_date: p.payment_date.format('YYYY-MM-DD'),
        reference_number: values.reference_number,
        remarks: values.remarks
      }));

      if (validPayments.length === 0) {
        message.warning('Please enter amount for at least one unit');
        return;
      }

      setLoading(true);
      for (const payment of validPayments) {
        await window.api.payments.create(payment);
      }
      message.success(`Successfully recorded ${validPayments.length} payments`);
      setIsBulkModalOpen(false);
      fetchData();
    } catch (error) {
      console.error(error);
      message.error('Failed to record bulk payments');
    } finally {
      setLoading(false);
    }
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      const selectedUnit = units.find(u => u.id === values.unit_id);
      const paymentData = {
        ...values,
        project_id: selectedUnit?.project_id,
        payment_date: values.payment_date.format('YYYY-MM-DD'),
      };
      
      setLoading(true);
      await window.api.payments.create(paymentData);
      message.success('Payment recorded successfully');
      setIsModalOpen(false);
      fetchData();
    } catch (error) {
      console.error(error);
      message.error('Failed to record payment');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    Modal.confirm({
      title: 'Are you sure you want to delete this payment?',
      onOk: async () => {
        await window.api.payments.delete(id);
        message.success('Payment deleted');
        fetchData();
      },
    });
  };

  const handleBulkDelete = async () => {
    Modal.confirm({
      title: `Are you sure you want to delete ${selectedRowKeys.length} payments?`,
      content: 'This action cannot be undone.',
      okText: 'Yes, Delete',
      okType: 'danger',
      cancelText: 'No',
      onOk: async () => {
        setLoading(true);
        try {
          await window.api.payments.bulkDelete(selectedRowKeys as number[]);
          message.success(`Successfully deleted ${selectedRowKeys.length} payments`);
          fetchData();
        } catch (error) {
          message.error('Failed to delete payments');
        } finally {
          setLoading(false);
        }
      },
    });
  };

  const handlePrintReceipt = async (id: number) => {
    try {
      setLoading(true);
      const pdfPath = await window.api.payments.generateReceiptPdf(id);
      await window.api.shell.showItemInFolder(pdfPath);
    } catch (error) {
      console.error(error);
      message.error('Failed to generate receipt');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    { 
      title: 'Receipt #', 
      dataIndex: 'receipt_number', 
      key: 'receipt_number',
      fixed: 'left' as const,
      sorter: (a: Payment, b: Payment) => a.receipt_number.localeCompare(b.receipt_number),
    },
    { 
      title: 'Date', 
      dataIndex: 'payment_date', 
      key: 'payment_date',
      sorter: (a: Payment, b: Payment) => dayjs(a.payment_date).unix() - dayjs(b.payment_date).unix(),
    },
    { 
      title: 'Project', 
      dataIndex: 'project_name', 
      key: 'project_name',
      sorter: (a: Payment, b: Payment) => a.project_name.localeCompare(b.project_name),
    },
    { 
      title: 'Unit', 
      dataIndex: 'unit_number', 
      key: 'unit_number',
      sorter: (a: Payment, b: Payment) => a.unit_number.localeCompare(b.unit_number),
    },
    { 
      title: 'Owner', 
      dataIndex: 'owner_name', 
      key: 'owner_name',
      sorter: (a: Payment, b: Payment) => a.owner_name.localeCompare(b.owner_name),
    },
    { 
      title: 'Amount', 
      dataIndex: 'payment_amount', 
      key: 'payment_amount',
      align: 'right' as const,
      render: (val: number) => `₹${val.toFixed(2)}`,
      sorter: (a: Payment, b: Payment) => a.payment_amount - b.payment_amount,
    },
    { 
      title: 'Mode', 
      dataIndex: 'payment_mode', 
      key: 'payment_mode', 
      align: 'center' as const,
      render: (mode: string) => <Tag color="blue">{mode}</Tag> 
    },
    {
      title: 'Actions',
      key: 'actions',
      align: 'right' as const,
      render: (_, record: Payment) => (
        <Space>
          <Button size="small" icon={<PrinterOutlined />} onClick={() => handlePrintReceipt(record.id)} title="Print Receipt" />
          <Button size="small" icon={<DeleteOutlined />} danger onClick={() => handleDelete(record.id)} title="Delete Payment" />
        </Space>
      ),
    },
  ];

  const filteredPayments = payments.filter(payment => {
    const matchSearch = !searchText || 
      payment.unit_number.toLowerCase().includes(searchText.toLowerCase()) ||
      payment.owner_name.toLowerCase().includes(searchText.toLowerCase()) ||
      payment.receipt_number.toLowerCase().includes(searchText.toLowerCase());
    const matchProject = !selectedProject || projects.find(s => s.id === selectedProject)?.name === payment.project_name;
    const matchMode = !selectedMode || payment.payment_mode === selectedMode;
    return matchSearch && matchProject && matchMode;
  });

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: '16px' }}>
        <Title level={2} style={{ margin: 0 }}>Payments & Receipts</Title>
        <Space>
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
              style={{ width: 300 }}
              enterButton
              suffix={null}
            />
            <Select 
              placeholder="Project" 
              style={{ width: 200 }} 
              allowClear
              onChange={setSelectedProject}
              value={selectedProject}
            >
              {projects.map(s => <Option key={s.id} value={s.id}>{s.name}</Option>)}
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
            {selectedRowKeys.length > 0 && (
              <Button 
                danger 
                icon={<DeleteOutlined />} 
                onClick={handleBulkDelete}
              >
                Delete Selected ({selectedRowKeys.length})
              </Button>
            )}
          </Space>
        </div>

        <Table 
          rowSelection={{
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys),
          }}
          columns={columns} 
          dataSource={filteredPayments} 
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 'max-content' }}
        />
      </Card>

      <Modal
        title="Record New Payment"
        open={isModalOpen}
        onOk={handleModalOk}
        onCancel={() => setIsModalOpen(false)}
        confirmLoading={loading}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Divider orientation={"left" as any} style={{ marginTop: 0 }}>Unit & Letter</Divider>
          <Form.Item name="unit_id" label="Select Unit" rules={[{ required: true }]}>
            <Select 
              showSearch 
              placeholder="Search Unit" 
              filterOption={(input, option) => (option?.children as any).toLowerCase().includes(input.toLowerCase())}
              onChange={() => {
                form.setFieldsValue({ letter_id: undefined });
              }}
            >
              {units.map(u => <Option key={u.id} value={u.id}>{u.project_name} - {u.unit_number} ({u.owner_name})</Option>)}
            </Select>
          </Form.Item>
          
          <Form.Item 
            noStyle 
            shouldUpdate={(prevValues, currentValues) => prevValues.unit_id !== currentValues.unit_id}
          >
            {({ getFieldValue }) => {
              const unitId = getFieldValue('unit_id');
              const unitLetters = letters.filter(l => l.unit_id === unitId);
              return (
                <Form.Item 
                  name="letter_id" 
                  label="Maintenance Letter"
                  extra={unitLetters.length === 0 ? "No maintenance letters found for this unit" : ""}
                >
                  <Select placeholder="Select Maintenance Letter" allowClear disabled={unitLetters.length === 0}>
                    {unitLetters.map(letter => (
                      <Option key={letter.id} value={letter.id}>
                        {letter.financial_year} - ₹{letter.final_amount}
                      </Option>
                    ))}
                  </Select>
                </Form.Item>
              );
            }}
          </Form.Item>

          <Divider orientation={"left" as any}>Payment Details</Divider>
          <Form.Item name="payment_date" label="Payment Date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="payment_amount" label="Amount (₹)" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="payment_mode" label="Payment Mode" rules={[{ required: true }]}>
            <Select>
              <Option value="Transfer">Bank Transfer / UPI</Option>
              <Option value="Cheque">Cheque</Option>
              <Option value="Cash">Cash</Option>
            </Select>
          </Form.Item>
          <Form.Item name="reference_number" label="Ref # (UTR/Cheque No)">
            <Input />
          </Form.Item>
          
          <Form.Item name="remarks" label="Remarks">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="Bulk Payment Entry"
        open={isBulkModalOpen}
        onOk={handleBulkModalOk}
        onCancel={() => setIsBulkModalOpen(false)}
        confirmLoading={loading}
        width={1000}
      >
        <Form form={bulkForm} layout="vertical">
          <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
            <Form.Item label="Project" style={{ flex: 1 }}>
              <Select placeholder="Select Project" onChange={handleBulkProjectChange} value={bulkProject}>
                {projects.map(s => <Option key={s.id} value={s.id}>{s.name}</Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="payment_date" label="Payment Date" initialValue={dayjs()} style={{ flex: 1 }}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="payment_mode" label="Default Mode" initialValue="Transfer" style={{ flex: 1 }}>
              <Select onChange={(val) => setBulkPayments(prev => prev.map(p => ({ ...p, payment_mode: val })))}>
                <Option value="Transfer">Bank Transfer / UPI</Option>
                <Option value="Cheque">Cheque</Option>
                <Option value="Cash">Cash</Option>
              </Select>
            </Form.Item>
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
                render: (_, record, index) => (
                  <InputNumber 
                    min={0} 
                    style={{ width: '100%' }} 
                    value={record.payment_amount}
                    onChange={(val) => {
                      const newPayments = [...bulkPayments];
                      newPayments[index].payment_amount = val || 0;
                      setBulkPayments(newPayments);
                    }}
                  />
                )
              },
              {
                title: 'Mode',
                key: 'mode',
                width: 150,
                render: (_, record, index) => (
                  <Select
                    style={{ width: '100%' }}
                    value={record.payment_mode}
                    onChange={(val) => {
                      const newPayments = [...bulkPayments];
                      newPayments[index].payment_mode = val;
                      setBulkPayments(newPayments);
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

          <div style={{ marginTop: '16px', display: 'flex', gap: '16px' }}>
            <Form.Item name="reference_number" label="Common Ref # (Optional)" style={{ flex: 1 }}>
              <Input placeholder="UTR / Cheque No" />
            </Form.Item>
            <Form.Item name="remarks" label="Common Remarks (Optional)" style={{ flex: 1 }}>
              <Input />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default Payments;
