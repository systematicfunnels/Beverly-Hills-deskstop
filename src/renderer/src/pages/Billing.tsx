import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Modal, Form, Select, DatePicker, message, Typography, Tag, notification } from 'antd';
import { FilePdfOutlined, PlusOutlined, FolderOpenOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const { Title } = Typography;
const { Option } = Select;

interface Invoice {
  id: number;
  unit_number: string;
  owner_name: string;
  society_name: string;
  billing_month: number;
  billing_year: number;
  invoice_date: string;
  total_amount: number;
  status: string;
  pdf_path?: string;
}

interface Society {
  id: number;
  name: string;
}

const Billing: React.FC = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [societies, setSocieties] = useState<Society[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form] = Form.useForm();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [invoicesData, societiesData] = await Promise.all([
        window.api.invoices.getAll(),
        window.api.societies.getAll(),
      ]);
      setInvoices(invoicesData);
      setSocieties(societiesData);
    } catch (error) {
      message.error('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleBatchGenerate = () => {
    form.resetFields();
    setIsModalOpen(true);
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      const { society_id, period, invoice_date, due_date } = values;
      
      const month = period.month() + 1;
      const year = period.year();
      const dateStr = invoice_date.format('YYYY-MM-DD');
      const dueStr = due_date.format('YYYY-MM-DD');

      setLoading(true);
      await window.api.invoices.createBatch(society_id, month, year, dateStr, dueStr);
      message.success('Batch invoices generated successfully');
      setIsModalOpen(false);
      fetchData();
    } catch (error) {
      console.error(error);
      message.error('Failed to generate batch invoices');
    } finally {
      setLoading(false);
    }
  };

  const handleViewPdf = async (id: number) => {
    try {
      const path = await window.api.invoices.generatePdf(id);
      notification.success({
        message: 'PDF Generated',
        description: `Invoice PDF has been saved.`,
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
        placement: 'bottomRight',
      });
    } catch (error) {
      message.error('Failed to generate PDF');
    }
  };

  const columns = [
    { 
      title: 'Inv ID', 
      dataIndex: 'id', 
      key: 'id',
      fixed: 'left' as const,
    },
    { title: 'Society', dataIndex: 'society_name', key: 'society_name' },
    { title: 'Unit', dataIndex: 'unit_number', key: 'unit_number' },
    { 
      title: 'Period', 
      key: 'period', 
      render: (_, record: Invoice) => `${dayjs().month(record.billing_month - 1).format('MMMM')} ${record.billing_year}` 
    },
    { 
      title: 'Amount', 
      dataIndex: 'total_amount', 
      key: 'total_amount', 
      align: 'right' as const,
      render: (val: number) => `₹${val.toFixed(2)}` 
    },
    { 
      title: 'Status', 
      dataIndex: 'status', 
      key: 'status',
      align: 'center' as const,
      render: (status: string) => (
        <Tag color={status === 'Paid' ? 'green' : 'volcano'}>{status}</Tag>
      )
    },
    {
      title: 'Actions',
      key: 'actions',
      align: 'right' as const,
      render: (_, record: Invoice) => (
        <Space>
          <Button size="small" icon={<FilePdfOutlined />} onClick={() => handleViewPdf(record.id)}>PDF</Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title level={2}>Billing & Invoices</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleBatchGenerate}>
          Generate Batch Invoices
        </Button>
      </div>

      <Table 
        columns={columns} 
        dataSource={invoices} 
        rowKey="id" 
        loading={loading}
        sticky
        pagination={{ pageSize: 20 }}
      />

      <Modal
        title="Generate Batch Invoices"
        open={isModalOpen}
        onOk={handleModalOk}
        onCancel={() => setIsModalOpen(false)}
        confirmLoading={loading}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="society_id" label="Society" rules={[{ required: true }]}>
            <Select placeholder="Select Society">
              {societies.map(s => <Option key={s.id} value={s.id}>{s.name}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="period" label="Billing Period (Month/Year)" rules={[{ required: true }]}>
            <DatePicker picker="month" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="invoice_date" label="Invoice Date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="due_date" label="Due Date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Billing;
