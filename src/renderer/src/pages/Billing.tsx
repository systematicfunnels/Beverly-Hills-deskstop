import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Modal, Form, Select, DatePicker, message, Typography, Tag, notification, Input, Card } from 'antd';
import { FilePdfOutlined, PlusOutlined, FolderOpenOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const { Title } = Typography;
const { Option } = Select;
const { Search } = Input;

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
  const [selectedSociety, setSelectedSociety] = useState<number | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [searchText, setSearchText] = useState('');
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
      message.loading({ content: 'Generating PDF...', key: 'pdf_gen' });
      const path = await window.api.invoices.generatePdf(id);
      message.success({ content: 'PDF Generated successfully!', key: 'pdf_gen' });
      notification.success({
        message: 'PDF Ready',
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
      message.error({ content: 'Failed to generate PDF', key: 'pdf_gen' });
    }
  };

  const handleDelete = async (id: number) => {
    Modal.confirm({
      title: 'Are you sure you want to delete this invoice?',
      content: 'This action cannot be undone.',
      okText: 'Yes, Delete',
      okType: 'danger',
      cancelText: 'No',
      onOk: async () => {
        await window.api.invoices.delete(id);
        message.success('Invoice deleted');
        fetchData();
      },
    });
  };

  const handleBulkDelete = async () => {
    Modal.confirm({
      title: `Are you sure you want to delete ${selectedRowKeys.length} invoices?`,
      content: 'This action cannot be undone.',
      okText: 'Yes, Delete',
      okType: 'danger',
      cancelText: 'No',
      onOk: async () => {
        setLoading(true);
        try {
          await window.api.invoices.bulkDelete(selectedRowKeys as number[]);
          message.success(`Successfully deleted ${selectedRowKeys.length} invoices`);
          fetchData();
        } catch (error) {
          message.error('Failed to delete invoices');
        } finally {
          setLoading(false);
        }
      },
    });
  };

  const columns = [
    { 
      title: 'Inv ID', 
      dataIndex: 'id', 
      key: 'id',
      fixed: 'left' as const,
      sorter: (a: Invoice, b: Invoice) => a.id - b.id,
    },
    { 
      title: 'Society', 
      dataIndex: 'society_name', 
      key: 'society_name',
      sorter: (a: Invoice, b: Invoice) => a.society_name.localeCompare(b.society_name),
    },
    { 
      title: 'Unit', 
      dataIndex: 'unit_number', 
      key: 'unit_number',
      sorter: (a: Invoice, b: Invoice) => a.unit_number.localeCompare(b.unit_number),
    },
    { 
      title: 'Period', 
      key: 'period', 
      render: (_, record: Invoice) => `${dayjs().month(record.billing_month - 1).format('MMMM')} ${record.billing_year}`,
      sorter: (a: Invoice, b: Invoice) => {
        if (a.billing_year !== b.billing_year) return a.billing_year - b.billing_year;
        return a.billing_month - b.billing_month;
      }
    },
    { 
      title: 'Amount', 
      dataIndex: 'total_amount', 
      key: 'total_amount', 
      align: 'right' as const,
      render: (val: number) => `₹${val.toFixed(2)}`,
      sorter: (a: Invoice, b: Invoice) => a.total_amount - b.total_amount,
    },
    { 
      title: 'Status', 
      dataIndex: 'status', 
      key: 'status',
      align: 'center' as const,
      render: (status: string) => (
        <Tag color={status === 'Paid' ? 'green' : 'volcano'}>{status}</Tag>
      ),
      sorter: (a: Invoice, b: Invoice) => a.status.localeCompare(b.status),
    },
    {
      title: 'Actions',
      key: 'actions',
      align: 'right' as const,
      render: (_, record: Invoice) => (
        <Space>
          <Button size="small" icon={<FilePdfOutlined />} onClick={() => handleViewPdf(record.id)}>PDF</Button>
          <Button size="small" icon={<DeleteOutlined />} danger onClick={() => handleDelete(record.id)} />
        </Space>
      ),
    },
  ];

  const filteredInvoices = invoices.filter(invoice => {
    const matchSearch = !searchText || 
      invoice.unit_number.toLowerCase().includes(searchText.toLowerCase()) ||
      invoice.owner_name.toLowerCase().includes(searchText.toLowerCase()) ||
      String(invoice.id).includes(searchText);
    const matchSociety = !selectedSociety || societies.find(s => s.id === selectedSociety)?.name === invoice.society_name;
    const matchStatus = !selectedStatus || invoice.status === selectedStatus;
    const matchMonth = !selectedMonth || invoice.billing_month === selectedMonth;
    const matchYear = !selectedYear || invoice.billing_year === selectedYear;
    return matchSearch && matchSociety && matchStatus && matchMonth && matchYear;
  });

  const years = Array.from(new Set(invoices.map(i => i.billing_year))).sort((a, b) => b - a);

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: '16px' }}>
        <Title level={2} style={{ margin: 0 }}>Billing & Invoices</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleBatchGenerate}>
          Generate Invoices
        </Button>
      </div>

      <Card>
        <div style={{ marginBottom: 24 }}>
          <Space wrap size="middle">
            <Search
              placeholder="Search unit, owner, ID..."
              allowClear
              onChange={(e) => setSearchText(e.target.value)}
              onSearch={setSearchText}
              style={{ width: 300 }}
              enterButton
              suffix={null}
            />
            <Select 
              placeholder="Society" 
              style={{ width: 180 }} 
              allowClear
              onChange={setSelectedSociety}
              value={selectedSociety}
            >
              {societies.map(s => <Option key={s.id} value={s.id}>{s.name}</Option>)}
            </Select>
            <Select 
              placeholder="Month" 
              style={{ width: 140 }} 
              allowClear
              onChange={setSelectedMonth}
              value={selectedMonth}
            >
              {Array.from({ length: 12 }, (_, i) => (
                <Option key={i + 1} value={i + 1}>
                  {dayjs().month(i).format('MMMM')}
                </Option>
              ))}
            </Select>
            <Select 
              placeholder="Year" 
              style={{ width: 110 }} 
              allowClear
              onChange={setSelectedYear}
              value={selectedYear}
            >
              {years.map(year => (
                <Option key={year} value={year}>{year}</Option>
              ))}
            </Select>
            <Select 
              placeholder="Status" 
              style={{ width: 130 }} 
              allowClear
              onChange={setSelectedStatus}
              value={selectedStatus}
            >
              <Option value="Paid">Paid</Option>
              <Option value="Unpaid">Unpaid</Option>
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
          dataSource={filteredInvoices} 
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 'max-content' }}
        />
      </Card>

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
