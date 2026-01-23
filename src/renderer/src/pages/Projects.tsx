import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Modal, Form, Input, message, Divider, Upload } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, UploadOutlined } from '@ant-design/icons';
import * as XLSX from 'xlsx';

interface Project {
  id?: number;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  status?: string;
  letterhead_path?: string;
  bank_name?: string;
  account_no?: string;
  ifsc_code?: string;
  qr_code_path?: string;
}

const Projects: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [form] = Form.useForm();

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const data = await window.api.projects.getAll();
      setProjects(data);
    } catch (error) {
      message.error('Failed to fetch projects');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleAdd = () => {
    setEditingProject(null);
    form.resetFields();
    setIsModalOpen(true);
  };

  const handleImport = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet) as any[];
        
        if (jsonData.length === 0) {
          message.warning('No data found in the Excel file');
          return;
        }

        const projectsToImport = jsonData.map(row => {
          const normalizedRow: any = {};
          Object.keys(row).forEach(key => {
            normalizedRow[String(key).toLowerCase().trim()] = row[key];
          });

          const getValue = (keys: string[]) => {
            for (const key of keys) {
              if (normalizedRow[key] !== undefined && normalizedRow[key] !== null && String(normalizedRow[key]).trim() !== '') {
                return normalizedRow[key];
              }
            }
            return undefined;
          };

          const name = String(getValue(['name', 'project name', 'project', 'building name', 'building', 'particulars']) || '').trim();
          
          // If name is empty or looks like a header/id column, skip
          if (!name || /^(name|project|building|id|no|particulars)$/i.test(name)) return null;

          return {
            name,
            address: String(getValue(['address', 'location', 'site address']) || '').trim(),
            city: String(getValue(['city', 'town']) || 'Ahmedabad').trim(),
            state: String(getValue(['state', 'region']) || 'Gujarat').trim(),
            pincode: String(getValue(['pincode', 'pin', 'zip', 'zipcode']) || '').trim(),
            status: 'Active',
            bank_name: String(getValue(['bank', 'bank name', 'bank_name', 'bank details']) || '').trim(),
            account_no: String(getValue(['account', 'account no', 'account number', 'acc no', 'a/c no']) || '').trim(),
            ifsc_code: String(getValue(['ifsc', 'ifsc code', 'ifsc_code', 'ifsc code']) || '').trim(),
          };
        }).filter(p => p !== null && p.name);

        if (projectsToImport.length === 0) {
          message.warning('No valid projects found (Name is required)');
          return;
        }

        setLoading(true);
        for (const p of projectsToImport) {
          await window.api.projects.create(p);
        }
        message.success(`Successfully imported ${projectsToImport.length} projects`);
        fetchProjects();
      } catch (err) {
        console.error(err);
        message.error('Failed to parse Excel file');
      } finally {
        setLoading(false);
      }
    };
    reader.readAsBinaryString(file);
    return false;
  };

  const handleEdit = (record: Project) => {
    setEditingProject(record);
    form.setFieldsValue(record);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    Modal.confirm({
      title: 'Are you sure you want to delete this project?',
      content: 'This action cannot be undone.',
      onOk: async () => {
        try {
          await window.api.projects.delete(id);
          message.success('Project deleted successfully');
          fetchProjects();
        } catch (error) {
          message.error('Failed to delete project');
        }
      },
    });
  };

  const handleBulkDelete = () => {
    Modal.confirm({
      title: `Delete ${selectedRowKeys.length} projects?`,
      content: 'This action cannot be undone. All related units, maintenance letters, and payments will also be deleted.',
      okText: 'Delete All',
      okType: 'danger',
      onOk: async () => {
        try {
          await window.api.projects.bulkDelete(selectedRowKeys as number[]);
          message.success(`${selectedRowKeys.length} projects deleted successfully`);
          setSelectedRowKeys([]);
          fetchProjects();
        } catch (error) {
          console.error(error);
          message.error('Failed to delete projects');
        }
      },
    });
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      if (editingProject?.id) {
        await window.api.projects.update(editingProject.id, values);
        message.success('Project updated successfully');
      } else {
        await window.api.projects.create(values);
        message.success('Project created successfully');
      }
      setIsModalOpen(false);
      fetchProjects();
    } catch (error) {
      console.error(error);
    }
  };

  const columns = [
    { 
      title: 'Name', 
      dataIndex: 'name', 
      key: 'name',
    },
    { title: 'City', dataIndex: 'city', key: 'city' },
    { title: 'Bank Name', dataIndex: 'bank_name', key: 'bank_name' },
    { title: 'Account No', dataIndex: 'account_no', key: 'account_no' },
    { title: 'Status', dataIndex: 'status', key: 'status' },
    {
      title: 'Actions',
      key: 'actions',
      align: 'right' as const,
      render: (_: any, record: Project) => (
        <Space size="middle">
          <Button icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          <Button icon={<DeleteOutlined />} danger onClick={() => handleDelete(record.id!)} />
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Projects</h2>
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
          <Upload beforeUpload={handleImport} showUploadList={false}>
            <Button icon={<UploadOutlined />}>
              Import Excel
            </Button>
          </Upload>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            Add Project
          </Button>
        </Space>
      </div>

      <Table 
        rowSelection={{
          selectedRowKeys,
          onChange: setSelectedRowKeys,
        }}
        dataSource={projects} 
        columns={columns} 
        rowKey="id" 
        loading={loading}
      />

      <Modal
        title={editingProject ? 'Edit Project' : 'Add Project'}
        open={isModalOpen}
        onOk={handleModalOk}
        onCancel={() => setIsModalOpen(false)}
        width={700}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ status: 'Active', city: 'Ahmedabad', state: 'Gujarat' }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <Form.Item
              name="name"
              label="Project Name"
              rules={[{ required: true, message: 'Please enter project name' }]}
              style={{ gridColumn: 'span 2' }}
            >
              <Input />
            </Form.Item>

            <Form.Item
              name="address"
              label="Address"
              style={{ gridColumn: 'span 2' }}
            >
              <Input.TextArea rows={2} />
            </Form.Item>

            <Form.Item name="city" label="City">
              <Input />
            </Form.Item>

            <Form.Item name="state" label="State">
              <Input />
            </Form.Item>

            <Form.Item name="pincode" label="Pincode">
              <Input />
            </Form.Item>

            <Form.Item name="status" label="Status">
              <Input />
            </Form.Item>

            <Divider style={{ gridColumn: 'span 2', margin: '8px 0' }}>Bank Details</Divider>

            <Form.Item name="bank_name" label="Bank Name">
              <Input />
            </Form.Item>

            <Form.Item name="account_no" label="Account Number">
              <Input />
            </Form.Item>

            <Form.Item name="ifsc_code" label="IFSC Code">
              <Input />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default Projects;
