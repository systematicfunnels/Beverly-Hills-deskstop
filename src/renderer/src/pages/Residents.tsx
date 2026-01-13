import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Modal, Form, Input, InputNumber, message, Select, Upload, Divider, Typography, Card } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, UploadOutlined } from '@ant-design/icons';
import * as XLSX from 'xlsx';

const { Title } = Typography;
const { Option } = Select;
const { Search } = Input;

interface Unit {
  id?: number;
  society_id: number;
  unit_number: string;
  wing?: string;
  area_sqft: number;
  owner_name: string;
  contact_number?: string;
  email?: string;
  society_name?: string;
}

interface Society {
  id: number;
  name: string;
}

const Residents: React.FC = () => {
  const [units, setUnits] = useState<Unit[]>([]);
  const [filteredUnits, setFilteredUnits] = useState<Unit[]>([]);
  const [searchText, setSearchText] = useState('');
  const [selectedSociety, setSelectedSociety] = useState<number | null>(null);
  const [selectedWing, setSelectedWing] = useState<string | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [societies, setSocieties] = useState<Society[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [importData, setImportData] = useState<any[]>([]);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importSocietyId, setImportSocietyId] = useState<number | null>(null);
  const [form] = Form.useForm();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [unitsData, societiesData] = await Promise.all([
        window.api.units.getAll(),
        window.api.societies.getAll(),
      ]);
      setUnits(unitsData);
      setFilteredUnits(unitsData);
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

  useEffect(() => {
    const filtered = units.filter(unit => {
      const matchSearch = unit.unit_number.toLowerCase().includes(searchText.toLowerCase()) ||
                         unit.owner_name.toLowerCase().includes(searchText.toLowerCase());
      const matchSociety = !selectedSociety || unit.society_id === selectedSociety;
      const matchWing = !selectedWing || unit.wing === selectedWing;
      return matchSearch && matchSociety && matchWing;
    });
    setFilteredUnits(filtered);
  }, [searchText, selectedSociety, selectedWing, units]);

  const wings = Array.from(new Set(units.map(u => u.wing).filter(Boolean))).sort() as string[];

  const handleAdd = () => {
    setEditingUnit(null);
    form.resetFields();
    setIsModalOpen(true);
  };

  const handleEdit = (record: Unit) => {
    setEditingUnit(record);
    form.setFieldsValue(record);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    Modal.confirm({
      title: 'Are you sure?',
      onOk: async () => {
        await window.api.units.delete(id);
        message.success('Unit deleted');
        fetchData();
      },
    });
  };

  const handleBulkDelete = async () => {
    Modal.confirm({
      title: `Are you sure you want to delete ${selectedRowKeys.length} units?`,
      content: 'This action cannot be undone.',
      okText: 'Yes, Delete',
      okType: 'danger',
      cancelText: 'No',
      onOk: async () => {
        setLoading(true);
        try {
          await window.api.units.bulkDelete(selectedRowKeys as number[]);
          message.success(`Successfully deleted ${selectedRowKeys.length} units`);
          fetchData();
        } catch (error) {
          message.error('Failed to delete units');
        } finally {
          setLoading(false);
        }
      },
    });
  };

  const handleModalOk = async () => {
    const values = await form.validateFields();
    if (editingUnit?.id) {
      await window.api.units.update(editingUnit.id, values);
    } else {
      await window.api.units.create(values);
    }
    setIsModalOpen(false);
    fetchData();
  };

  const handleImport = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const data = e.target?.result;
      const workbook = XLSX.read(data, { type: 'binary' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(sheet);
      
      if (jsonData.length === 0) {
        message.warning('No data found in the Excel file');
        return;
      }

      setImportData(jsonData);
      setIsImportModalOpen(true);
    };
    reader.readAsBinaryString(file);
    return false;
  };

  const handleImportOk = async () => {
    if (!importSocietyId) {
      message.error('Please select a society for import');
      return;
    }

    setLoading(true);
    try {
      const mappedUnits = importData.map((row: any) => ({
        society_id: importSocietyId,
        unit_number: String(row['Unit Number'] || row['Unit'] || ''),
        wing: String(row['Wing'] || ''),
        area_sqft: Number(row['Area'] || row['Sqft'] || 0),
        owner_name: String(row['Owner'] || row['Name'] || 'Unknown'),
        contact_number: String(row['Contact'] || row['Phone'] || ''),
        email: String(row['Email'] || ''),
      }));

      await window.api.units.bulkCreate(mappedUnits);
      message.success(`Successfully imported ${mappedUnits.length} units`);
      setIsImportModalOpen(false);
      setImportData([]);
      setImportSocietyId(null);
      fetchData();
    } catch (error) {
      console.error(error);
      message.error('Failed to import units');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    { 
      title: 'Society', 
      dataIndex: 'society_name', 
      key: 'society_name',
      fixed: 'left' as const, // Blueprint: fixed first column
      sorter: (a: Unit, b: Unit) => (a.society_name || '').localeCompare(b.society_name || ''),
    },
    { 
      title: 'Unit No', 
      dataIndex: 'unit_number', 
      key: 'unit_number',
      sorter: (a: Unit, b: Unit) => a.unit_number.localeCompare(b.unit_number),
    },
    { 
      title: 'Wing', 
      dataIndex: 'wing', 
      key: 'wing',
      sorter: (a: Unit, b: Unit) => (a.wing || '').localeCompare(b.wing || ''),
    },
    { 
      title: 'Owner', 
      dataIndex: 'owner_name', 
      key: 'owner_name',
      sorter: (a: Unit, b: Unit) => a.owner_name.localeCompare(b.owner_name),
    },
    { 
      title: 'Area (sqft)', 
      dataIndex: 'area_sqft', 
      key: 'area_sqft',
      align: 'right' as const, // Blueprint: numeric totals right aligned
      sorter: (a: Unit, b: Unit) => a.area_sqft - b.area_sqft,
    },
    {
      title: 'Actions',
      key: 'actions',
      align: 'right' as const, // Blueprint: actions column last & right aligned
      render: (_: any, record: Unit) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          <Button size="small" icon={<DeleteOutlined />} danger onClick={() => handleDelete(record.id!)} />
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: '16px' }}>
        <Title level={2} style={{ margin: 0 }}>Residents & Units</Title>
        <Space wrap>
          <Upload beforeUpload={handleImport} showUploadList={false}>
            <Button icon={<UploadOutlined />}>Import Excel</Button>
          </Upload>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            Add Unit
          </Button>
        </Space>
      </div>

      <Card>
        <div style={{ marginBottom: 24 }}>
          <Space wrap size="middle">
            <Search
              placeholder="Search unit, owner..."
              allowClear
              onSearch={setSearchText}
              onChange={(e) => setSearchText(e.target.value)}
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
              placeholder="Wing" 
              style={{ width: 150 }} 
              allowClear
              onChange={setSelectedWing}
              value={selectedWing}
            >
              {wings.map(wing => <Option key={wing} value={wing}>{wing}</Option>)}
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
          dataSource={filteredUnits} 
          rowKey="id" 
          loading={loading}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 'max-content' }}
        />
      </Card>

      <Modal
        title="Import Residents"
        open={isImportModalOpen}
        onOk={handleImportOk}
        onCancel={() => setIsImportModalOpen(false)}
        width={800}
      >
        <p>Found {importData.length} records in the Excel file.</p>
        
        {importData.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <p><strong>Preview (First 3 rows):</strong></p>
            <Table 
              size="small" 
              pagination={false} 
              dataSource={importData.slice(0, 3)} 
              columns={Object.keys(importData[0] || {}).map(key => ({ title: key, dataIndex: key, key }))}
              scroll={{ x: true }}
            />
          </div>
        )}

        <Form layout="vertical">
          <Form.Item label="Select Society for Import" required>
            <Select 
              placeholder="Choose society" 
              onChange={(val) => setImportSocietyId(val)}
              value={importSocietyId}
            >
              {societies.map((s) => (
                <Select.Option key={s.id} value={s.id}>{s.name}</Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
        <div style={{ marginTop: 16 }}>
          <p><strong>Expected Excel Columns:</strong></p>
          <ul>
            <li>Unit Number / Unit</li>
            <li>Wing (Optional)</li>
            <li>Area / Sqft</li>
            <li>Owner / Name</li>
            <li>Contact / Phone (Optional)</li>
            <li>Email (Optional)</li>
          </ul>
        </div>
      </Modal>

      <Modal
        title={editingUnit ? 'Edit Unit' : 'Add Unit'}
        open={isModalOpen}
        onOk={handleModalOk}
        onCancel={() => setIsModalOpen(false)}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Divider orientation={"left" as any} style={{ marginTop: 0 }}>Unit Information</Divider>
          <Form.Item name="society_id" label="Society" rules={[{ required: true }]}>
            <Select>
              {societies.map((s) => (
                <Select.Option key={s.id} value={s.id}>{s.name}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="unit_number" label="Unit Number" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="wing" label="Wing">
            <Input />
          </Form.Item>
          <Form.Item name="area_sqft" label="Area (sqft)" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>

          <Divider orientation={"left" as any}>Owner Information</Divider>
          <Form.Item name="owner_name" label="Owner Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="contact_number" label="Contact Number">
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Residents;
