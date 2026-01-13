import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Modal, Form, Select, DatePicker, message, Input, InputNumber, Tag, Typography, Divider, Card } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const { Title } = Typography;
const { Option } = Select;
const { Search } = Input;

interface Payment {
  id: number;
  unit_number: string;
  owner_name: string;
  society_name: string;
  payment_date: string;
  amount_paid: number;
  payment_mode: string;
  receipt_number: string;
}

interface Society {
  id: number;
  name: string;
}

interface Unit {
  id: number;
  unit_number: string;
  owner_name: string;
  society_name: string;
}

interface Invoice {
  id: number;
  unit_id: number;
  total_amount: number;
  billing_month: number;
  billing_year: number;
}

const Payments: React.FC = () => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [societies, setSocieties] = useState<Society[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSociety, setSelectedSociety] = useState<number | null>(null);
  const [selectedMode, setSelectedMode] = useState<string | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [searchText, setSearchText] = useState('');
  const [form] = Form.useForm();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [paymentsData, unitsData, invoicesData, societiesData] = await Promise.all([
        window.api.payments.getAll(),
        window.api.units.getAll(),
        window.api.invoices.getAll(),
        window.api.societies.getAll(),
      ]);
      setPayments(paymentsData);
      setUnits(unitsData);
      setInvoices(invoicesData.filter(i => i.status === 'Unpaid'));
      setSocieties(societiesData);
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

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      const paymentData = {
        ...values,
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
      title: 'Society', 
      dataIndex: 'society_name', 
      key: 'society_name',
      sorter: (a: Payment, b: Payment) => a.society_name.localeCompare(b.society_name),
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
      dataIndex: 'amount_paid', 
      key: 'amount_paid', 
      align: 'right' as const,
      render: (val: number) => `₹${val.toFixed(2)}`,
      sorter: (a: Payment, b: Payment) => a.amount_paid - b.amount_paid,
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
        <Button size="small" icon={<DeleteOutlined />} danger onClick={() => handleDelete(record.id)} />
      ),
    },
  ];

  const filteredPayments = payments.filter(payment => {
    const matchSearch = !searchText || 
      payment.unit_number.toLowerCase().includes(searchText.toLowerCase()) ||
      payment.owner_name.toLowerCase().includes(searchText.toLowerCase()) ||
      payment.receipt_number.toLowerCase().includes(searchText.toLowerCase());
    const matchSociety = !selectedSociety || societies.find(s => s.id === selectedSociety)?.name === payment.society_name;
    const matchMode = !selectedMode || payment.payment_mode === selectedMode;
    return matchSearch && matchSociety && matchMode;
  });

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: '16px' }}>
        <Title level={2} style={{ margin: 0 }}>Payments & Receipts</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          Record Payment
        </Button>
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
              placeholder="Society" 
              style={{ width: 200 }} 
              allowClear
              onChange={setSelectedSociety}
              value={selectedSociety}
            >
              {societies.map(s => <Option key={s.id} value={s.id}>{s.name}</Option>)}
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
          <Divider orientation={"left" as any} style={{ marginTop: 0 }}>Unit & Invoice</Divider>
          <Form.Item name="unit_id" label="Select Unit" rules={[{ required: true }]}>
            <Select showSearch placeholder="Search Unit" filterOption={(input, option) => (option?.children as any).toLowerCase().includes(input.toLowerCase())}>
              {units.map(u => <Option key={u.id} value={u.id}>{u.society_name} - {u.unit_number} ({u.owner_name})</Option>)}
            </Select>
          </Form.Item>
          
          <Form.Item name="invoice_id" label="Link to Invoice (Optional)">
            <Select placeholder="Select Unpaid Invoice">
              {invoices.map(i => (
                <Option key={i.id} value={i.id}>
                  INV-{i.id} ({dayjs().month(i.billing_month-1).format('MMM')} {i.billing_year}) - ₹{i.total_amount}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Divider orientation={"left" as any}>Payment Details</Divider>
          <Form.Item name="payment_date" label="Payment Date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="amount_paid" label="Amount (₹)" rules={[{ required: true }]}>
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
    </div>
  );
};

export default Payments;
