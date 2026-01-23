import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Modal, Form, Select, DatePicker, message, Typography, Tag, notification, Input, Card, Divider, InputNumber } from 'antd';
import { FilePdfOutlined, PlusOutlined, FolderOpenOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const { Title } = Typography;
const { Option } = Select;
const { Search } = Input;

interface MaintenanceLetter {
  id: number;
  unit_number: string;
  owner_name: string;
  project_name: string;
  financial_year: string;
  generated_date: string;
  final_amount: number;
  status: string;
  pdf_path?: string;
}

interface Project {
  id: number;
  name: string;
}

const Billing: React.FC = () => {
  const [letters, setLetters] = useState<MaintenanceLetter[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [searchText, setSearchText] = useState('');
  const [form] = Form.useForm();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [lettersData, projectsData] = await Promise.all([
        window.api.letters.getAll(),
        window.api.projects.getAll(),
      ]);
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

  const handleBatchGenerate = () => {
    form.resetFields();
    setIsModalOpen(true);
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      const { project_id, financial_year, letter_date, due_date, add_ons } = values;
      
      const letterDate = letter_date.format('YYYY-MM-DD');
      const dueDate = due_date.format('YYYY-MM-DD');

      setLoading(true);
      await window.api.letters.createBatch({
        projectId: project_id,
        financialYear: financial_year,
        letterDate,
        dueDate,
        addOns: add_ons || []
      });
      message.success('Maintenance letters generated successfully');
      setIsModalOpen(false);
      fetchData();
    } catch (error) {
      console.error(error);
      message.error('Failed to generate maintenance letters');
    } finally {
      setLoading(false);
    }
  };

  const handleViewPdf = async (id: number) => {
    try {
      message.loading({ content: 'Generating Letter...', key: 'pdf_gen' });
      const path = await window.api.letters.generatePdf(id);
      message.success({ content: 'Maintenance Letter generated successfully!', key: 'pdf_gen' });
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
        placement: 'bottomRight',
      });
    } catch (error) {
      message.error({ content: 'Failed to generate letter', key: 'pdf_gen' });
    }
  };

  const handleDelete = async (id: number) => {
    Modal.confirm({
      title: 'Are you sure you want to delete this maintenance letter?',
      content: 'This action cannot be undone.',
      okText: 'Yes, Delete',
      okType: 'danger',
      cancelText: 'No',
      onOk: async () => {
        await window.api.letters.delete(id);
        message.success('Maintenance letter deleted');
        fetchData();
      },
    });
  };

  const handleBulkDelete = async () => {
    Modal.confirm({
      title: `Are you sure you want to delete ${selectedRowKeys.length} maintenance letters?`,
      content: 'This action cannot be undone.',
      okText: 'Yes, Delete',
      okType: 'danger',
      cancelText: 'No',
      onOk: async () => {
        setLoading(true);
        try {
          await window.api.letters.bulkDelete(selectedRowKeys as number[]);
          message.success(`Successfully deleted ${selectedRowKeys.length} maintenance letters`);
          fetchData();
        } catch (error) {
          message.error('Failed to delete maintenance letters');
        } finally {
          setLoading(false);
        }
      },
    });
  };

  const columns = [
    { 
      title: 'ID', 
      dataIndex: 'id', 
      key: 'id',
      fixed: 'left' as const,
      sorter: (a: MaintenanceLetter, b: MaintenanceLetter) => a.id - b.id,
    },
    { 
      title: 'Project', 
      dataIndex: 'project_name', 
      key: 'project_name',
      sorter: (a: MaintenanceLetter, b: MaintenanceLetter) => a.project_name.localeCompare(b.project_name),
    },
    { 
      title: 'Unit', 
      dataIndex: 'unit_number', 
      key: 'unit_number',
      sorter: (a: MaintenanceLetter, b: MaintenanceLetter) => a.unit_number.localeCompare(b.unit_number),
    },
    { 
      title: 'FY', 
      dataIndex: 'financial_year', 
      key: 'financial_year',
      sorter: (a: MaintenanceLetter, b: MaintenanceLetter) => a.financial_year.localeCompare(b.financial_year),
    },
    { 
      title: 'Amount', 
      dataIndex: 'final_amount', 
      key: 'final_amount',
      align: 'right' as const,
      render: (val: number) => `₹${val.toFixed(2)}`,
      sorter: (a: MaintenanceLetter, b: MaintenanceLetter) => a.final_amount - b.final_amount,
    },
    { 
      title: 'Status', 
      dataIndex: 'status', 
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'Modified' ? 'orange' : 'green'}>{status}</Tag>
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
            onClick={() => handleViewPdf(record.id)}
          >
            View PDF
          </Button>
          <Button 
            icon={<DeleteOutlined />} 
            danger 
            onClick={() => handleDelete(record.id)}
          />
        </Space>
      ),
    },
  ];

  const filteredLetters = letters.filter(letter => {
    const matchesProject = !selectedProject || letter.project_name === projects.find(p => p.id === selectedProject)?.name;
    const matchesStatus = !selectedStatus || letter.status === selectedStatus;
    const matchesYear = !selectedYear || letter.financial_year === selectedYear;
    const matchesSearch = !searchText || 
      letter.owner_name.toLowerCase().includes(searchText.toLowerCase()) ||
      letter.unit_number.toLowerCase().includes(searchText.toLowerCase());
    
    return matchesProject && matchesStatus && matchesYear && matchesSearch;
  });

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Title level={4} style={{ margin: 0 }}>Maintenance Letters</Title>
          <Space>
            {selectedRowKeys.length > 0 && (
              <Button 
                danger 
                icon={<DeleteOutlined />} 
                onClick={handleBulkDelete}
              >
                Delete Selected ({selectedRowKeys.length})
              </Button>
            )}
            <Button type="primary" icon={<PlusOutlined />} onClick={handleBatchGenerate}>
              Generate Batch
            </Button>
          </Space>
        </div>

        <Space wrap>
          <Search
            placeholder="Search unit or owner..."
            allowClear
            onSearch={setSearchText}
            style={{ width: 200 }}
          />
          <Select
            placeholder="Filter by Project"
            style={{ width: 200 }}
            allowClear
            onChange={setSelectedProject}
          >
            {projects.map(p => (
              <Option key={p.id} value={p.id}>{p.name}</Option>
            ))}
          </Select>
          <Select
            placeholder="Filter by Status"
            style={{ width: 150 }}
            allowClear
            onChange={setSelectedStatus}
          >
            <Option value="Generated">Generated</Option>
            <Option value="Modified">Modified</Option>
          </Select>
          <Select
            placeholder="Filter by FY"
            style={{ width: 150 }}
            allowClear
            onChange={setSelectedYear}
          >
            {Array.from(new Set(letters.map(l => l.financial_year))).map(fy => (
              <Option key={fy} value={fy}>{fy}</Option>
            ))}
          </Select>
        </Space>
      </Card>

      <Table
        rowSelection={{
          selectedRowKeys,
          onChange: setSelectedRowKeys,
        }}
        columns={columns}
        dataSource={filteredLetters}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
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
                {projects.map(p => (
                  <Option key={p.id} value={p.id}>{p.name}</Option>
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
                      <Form.Item
                        {...restField}
                        name={[name, 'remarks']}
                      >
                        <Input placeholder="Remarks" />
                      </Form.Item>
                      <Button type="text" danger onClick={() => remove(name)} icon={<DeleteOutlined />} />
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
    </div>
  );
};

export default Billing;
