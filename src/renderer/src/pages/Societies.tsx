import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Modal, Form, Input, InputNumber, message, Divider } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';

interface Society {
  id?: number;
  name: string;
  bank_name?: string;
  account_no?: string;
  ifsc_code?: string;
  base_rate: number;
  tax_percentage: number;
  solar_charges: number;
}

const Societies: React.FC = () => {
  const [societies, setSocieties] = useState<Society[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSociety, setEditingSociety] = useState<Society | null>(null);
  const [form] = Form.useForm();

  const fetchSocieties = async () => {
    setLoading(true);
    try {
      const data = await window.api.societies.getAll();
      setSocieties(data);
    } catch (error) {
      message.error('Failed to fetch societies');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSocieties();
  }, []);

  const handleAdd = () => {
    setEditingSociety(null);
    form.resetFields();
    setIsModalOpen(true);
  };

  const handleEdit = (record: Society) => {
    setEditingSociety(record);
    form.setFieldsValue(record);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    Modal.confirm({
      title: 'Are you sure you want to delete this society?',
      content: 'This action cannot be undone.',
      onOk: async () => {
        try {
          await window.api.societies.delete(id);
          message.success('Society deleted successfully');
          fetchSocieties();
        } catch (error) {
          message.error('Failed to delete society');
        }
      },
    });
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      if (editingSociety?.id) {
        await window.api.societies.update(editingSociety.id, values);
        message.success('Society updated successfully');
      } else {
        await window.api.societies.create(values);
        message.success('Society created successfully');
      }
      setIsModalOpen(false);
      fetchSocieties();
    } catch (error) {
      console.error(error);
    }
  };

  const columns = [
    { 
      title: 'Name', 
      dataIndex: 'name', 
      key: 'name',
      fixed: 'left' as const,
    },
    { title: 'Bank Name', dataIndex: 'bank_name', key: 'bank_name' },
    { 
      title: 'Base Rate', 
      dataIndex: 'base_rate', 
      key: 'base_rate', 
      align: 'right' as const,
      render: (val: number) => `₹${val}` 
    },
    { 
      title: 'Tax %', 
      dataIndex: 'tax_percentage', 
      key: 'tax_percentage', 
      align: 'right' as const,
      render: (val: number) => `${val}%` 
    },
    {
      title: 'Actions',
      key: 'actions',
      align: 'right' as const,
      render: (_: any, record: Society) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          <Button size="small" icon={<DeleteOutlined />} danger onClick={() => handleDelete(record.id!)} />
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Societies</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          Add Society
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={societies}
        rowKey="id"
        loading={loading}
        sticky
        pagination={{ pageSize: 20 }}
      />

      <Modal
        title={editingSociety ? 'Edit Society' : 'Add Society'}
        open={isModalOpen}
        onOk={handleModalOk}
        onCancel={() => setIsModalOpen(false)}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Divider orientation={"left" as any} style={{ marginTop: 0 }}>Basic Details</Divider>
          <Form.Item name="name" label="Society Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>

          <Divider orientation={"left" as any}>Bank Information</Divider>
          <Form.Item name="bank_name" label="Bank Name">
            <Input />
          </Form.Item>
          <Form.Item name="account_no" label="Account Number">
            <Input />
          </Form.Item>
          <Form.Item name="ifsc_code" label="IFSC Code">
            <Input />
          </Form.Item>

          <Divider orientation={"left" as any}>Billing Rates</Divider>
          <Form.Item name="base_rate" label="Base Rate (₹/sqft)" initialValue={0}>
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="tax_percentage" label="Tax Percentage (%)" initialValue={0}>
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="solar_charges" label="Solar Charges (Fixed ₹)" initialValue={0}>
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Societies;
