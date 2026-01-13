import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Select, DatePicker, message, Input, InputNumber, Tag, Typography, Divider } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const { Title } = Typography;
const { Option } = Select;

interface Payment {
  id: number;
  unit_number: string;
  owner_name: string;
  payment_date: string;
  amount_paid: number;
  payment_mode: string;
  receipt_number: string;
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
  const [units, setUnits] = useState<Unit[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form] = Form.useForm();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [paymentsData, unitsData, invoicesData] = await Promise.all([
        window.api.payments.getAll(),
        window.api.units.getAll(),
        window.api.invoices.getAll(),
      ]);
      setPayments(paymentsData);
      setUnits(unitsData);
      setInvoices(invoicesData.filter(i => i.status === 'Unpaid'));
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

  const columns = [
    { 
      title: 'Receipt #', 
      dataIndex: 'receipt_number', 
      key: 'receipt_number',
      fixed: 'left' as const,
    },
    { title: 'Date', dataIndex: 'payment_date', key: 'payment_date' },
    { title: 'Unit', dataIndex: 'unit_number', key: 'unit_number' },
    { title: 'Owner', dataIndex: 'owner_name', key: 'owner_name' },
    { 
      title: 'Amount', 
      dataIndex: 'amount_paid', 
      key: 'amount_paid', 
      align: 'right' as const,
      render: (val: number) => `₹${val.toFixed(2)}` 
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

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title level={2}>Payments & Receipts</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          Record Payment
        </Button>
      </div>

      <Table 
        columns={columns} 
        dataSource={payments} 
        rowKey="id" 
        loading={loading}
        sticky
        pagination={{ pageSize: 20 }}
      />

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
