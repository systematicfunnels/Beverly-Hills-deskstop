import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Modal, Form, Input, InputNumber, message, Select, Upload, Divider, Typography, Card, Alert } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, UploadOutlined } from '@ant-design/icons';
import * as XLSX from 'xlsx';

const { Title } = Typography;
const { Option } = Select;
const { Search } = Input;

interface Unit {
  id?: number;
  project_id: number;
  unit_number: string;
  wing?: string;
  unit_type: string; // Residential, Commercial
  area_sqft: number;
  owner_name: string;
  contact_number?: string;
  email?: string;
  status: string; // Occupied, Vacant
  project_name?: string;
}

interface Project {
  id: number;
  name: string;
}

const Units: React.FC = () => {
  const [units, setUnits] = useState<Unit[]>([]);
  const [filteredUnits, setFilteredUnits] = useState<Unit[]>([]);
  const [searchText, setSearchText] = useState('');
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [selectedWing, setSelectedWing] = useState<string | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [importData, setImportData] = useState<any[]>([]);
  const [mappedPreview, setMappedPreview] = useState<any[]>([]);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importProjectId, setImportProjectId] = useState<number | null>(null);
  const [form] = Form.useForm();

  // Helper function to map a single row to a Unit object
  const mapRowToUnit = (row: any, projectId: number | null): any => {
    // Unique ID for preview editing
    const previewId = row.__id || Math.random().toString(36).substr(2, 9);
    
    // Create a normalized version of the row with lowercase keys and trimmed values
    const normalizedRow: any = {};
    Object.keys(row).forEach(key => {
      const normalizedKey = String(key).toLowerCase().trim();
      normalizedRow[normalizedKey] = row[key];
    });

    // Helper to find value by multiple possible keys
    const getValue = (possibleKeys: string[]) => {
      for (const key of possibleKeys) {
        if (normalizedRow[key] !== undefined && normalizedRow[key] !== null && String(normalizedRow[key]).trim() !== '') {
          return normalizedRow[key];
        }
      }
      return undefined;
    };

    // Auto-detect project if not selected
    let effectiveProjectId = projectId;
    if (!effectiveProjectId) {
      const projectName = String(getValue(['project', 'building', 'project name']) || '').trim().toLowerCase();
      if (projectName) {
        const matchedProject = projects.find(p => p.name.toLowerCase() === projectName);
        if (matchedProject) {
          effectiveProjectId = matchedProject.id;
        }
      }
    }

    // Try to find Unit Number - expanded search
    let unitNumber = String(getValue([
      'unit number', 'unit', 'unit_no', 'unitno', 'particulars', 
      'flat', 'flat no', 'flat_no', 'flat number',
      'plot', 'plot no', 'plot_no', 'plot number',
      'member code', 'id', 'shop', 'office'
    ]) || '').trim();

    // Try to find Owner Name - expanded search
    let ownerName = String(getValue([
      'owner', 'name', 'owner name', 'ownername', 'to', 'respected sir / madam',
      'member', 'member name', 'unit owner', 'unit owner name', 'customer', 'client'
    ]) || '').trim();

    // Fallback 1: Extract unit from owner name if it looks like "Name D-3/403" or "Name (A-101)"
    if (!unitNumber && ownerName) {
      const unitPattern = /([A-Z][-/\s]?\d+([-/\s]\d+)?)/i;
      const match = ownerName.match(unitPattern);
      if (match) {
        unitNumber = match[0].trim();
        ownerName = ownerName.replace(match[0], '').replace(/[()]/g, '').trim();
      }
    }

    // Fallback 2: Scan ALL columns for anything that looks like a unit number if still empty
    if (!unitNumber) {
      const unitRegex = /^[A-Z][-/\s]?\d+([-/\s]\d+)?$/i;
      for (const key of Object.keys(normalizedRow)) {
        const val = String(normalizedRow[key]).trim();
        if (unitRegex.test(val)) {
          unitNumber = val;
          break;
        }
      }
    }
    
    // If unitNumber is still empty, we still want to show the row but allow manual entry
    // We only skip if the row is completely empty or just header text
    if (!unitNumber && !ownerName && Object.keys(row).length <= 1) return null;
    if (unitNumber && /^(particulars|unit|flat|plot|id|no|shop|office)$/i.test(unitNumber)) return null;

    return {
      previewId,
      project_id: effectiveProjectId,
      unit_number: unitNumber,
      wing: String(getValue(['wing', 'block', 'a', 'sector', 'wing/block', 'bldg', 'building']) || '').trim() || (unitNumber.match(/^[A-Z]/i)?.[0] || ''),
      unit_type: String(getValue(['type', 'unit type', 'category', 'usage']) || 'Residential').trim(),
      area_sqft: Number(String(getValue(['area', 'sqft', 'area_sqft', 'area sqft', 'plot area sqft', 'sq.ft', 'sq-ft', 'builtup', 'built up']) || '0').replace(/[^0-9.]/g, '')),
      owner_name: ownerName || '',
      contact_number: String(getValue(['contact', 'phone', 'mobile', 'contact number', 'contact_no', 'mob.', 'mobile no', 'tel', 'phone no']) || '').trim(),
      email: String(getValue(['email', 'mail', 'email id', 'email_id', 'e-mail']) || '').trim(),
      status: String(getValue(['status', 'occupancy']) || 'Occupied').trim(),
    };
  };

  useEffect(() => {
    if (importData.length > 0) {
      const preview = importData.map((row, index) => {
        // Assign internal ID if not present
        if (!row.__id) row.__id = `row-${index}`;
        return mapRowToUnit(row, importProjectId);
      }).filter(u => u !== null);
      setMappedPreview(preview);
    } else {
      setMappedPreview([]);
    }
  }, [importData, importProjectId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [unitsData, projectsData] = await Promise.all([
        window.api.units.getAll(),
        window.api.projects.getAll(),
      ]);
      setUnits(unitsData);
      setFilteredUnits(unitsData);
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

  useEffect(() => {
    const filtered = units.filter(unit => {
      const matchSearch = unit.unit_number.toLowerCase().includes(searchText.toLowerCase()) ||
                         unit.owner_name.toLowerCase().includes(searchText.toLowerCase());
      const matchProject = !selectedProject || unit.project_id === selectedProject;
      const matchWing = !selectedWing || unit.wing === selectedWing;
      return matchSearch && matchProject && matchWing;
    });
    setFilteredUnits(filtered);
  }, [searchText, selectedProject, selectedWing, units]);

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
    // Pre-select project if one is already filtered in the main view
    if (selectedProject) {
      setImportProjectId(selectedProject);
    }

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
    if (!importProjectId) {
      message.error('Please select a project for import');
      return;
    }

    // Validation check for mandatory fields in the preview
    const invalidUnits = mappedPreview.filter(u => !u.unit_number || !u.owner_name);
    if (invalidUnits.length > 0) {
      message.error(`${invalidUnits.length} units are missing Unit Number or Owner Name. Please fill them in the preview table.`);
      return;
    }

    setLoading(true);
    try {
      await window.api.units.bulkCreate(mappedPreview as Unit[]);
      message.success(`Successfully imported ${mappedPreview.length} units`);
      setIsImportModalOpen(false);
      setImportData([]);
      setMappedPreview([]);
      setImportProjectId(null);
      fetchData();
    } catch (error) {
      console.error(error);
      message.error('Failed to import units');
    } finally {
      setLoading(false);
    }
  };

  const handlePreviewCellChange = (previewId: string, field: string, value: any) => {
    setMappedPreview(prev => prev.map(u => {
      if (u.previewId === previewId) {
        return { ...u, [field]: value };
      }
      return u;
    }));
  };

  const columns = [
    { 
      title: 'Project', 
      dataIndex: 'project_name', 
      key: 'project_name',
      fixed: 'left' as const,
      sorter: (a: Unit, b: Unit) => (a.project_name || '').localeCompare(b.project_name || ''),
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
      title: 'Type',
      dataIndex: 'unit_type',
      key: 'unit_type',
      sorter: (a: Unit, b: Unit) => (a.unit_type || '').localeCompare(b.unit_type || ''),
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
      align: 'right' as const,
      sorter: (a: Unit, b: Unit) => a.area_sqft - b.area_sqft,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      sorter: (a: Unit, b: Unit) => (a.status || '').localeCompare(b.status || ''),
    },
    {
      title: 'Actions',
      key: 'actions',
      align: 'right' as const,
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
        <Title level={2} style={{ margin: 0 }}>Units</Title>
        <Space wrap>
          <Upload beforeUpload={handleImport} showUploadList={false}>
            <Button icon={<UploadOutlined />}>
              Import Excel
            </Button>
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
              placeholder="Project" 
              style={{ width: 200 }} 
              allowClear
              onChange={setSelectedProject}
              value={selectedProject}
            >
              {projects.map(s => <Option key={s.id} value={s.id}>{s.name}</Option>)}
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
        title="Import Units from Excel"
        open={isImportModalOpen}
        onOk={handleImportOk}
        onCancel={() => {
          setIsImportModalOpen(false);
          setImportData([]);
          setMappedPreview([]);
        }}
        width={800}
        confirmLoading={loading}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <Alert 
            message="Autofill Preview" 
            description="The system is automatically identifying columns from your Excel. Check the table below to see if the data is being correctly extracted." 
            type="info" 
            showIcon 
          />
          
          <div>
            <Typography.Text strong>Step 1: Select Project</Typography.Text>
            <Select
              style={{ width: '100%', marginTop: 8 }}
              placeholder="Select Project"
              value={importProjectId}
              onChange={setImportProjectId}
            >
              {projects.map(s => (
                <Select.Option key={s.id} value={s.id}>{s.name}</Select.Option>
              ))}
            </Select>
          </div>

          {mappedPreview.length > 0 && (
            <div>
              <Typography.Text strong>Step 2: Preview & Edit Data</Typography.Text>
              <Typography.Paragraph type="secondary" style={{ fontSize: '12px', marginTop: 4 }}>
                Double-click on any cell to edit. Red borders indicate missing required fields.
              </Typography.Paragraph>
              <Table 
                size="small" 
                pagination={{ pageSize: 5 }} 
                dataSource={mappedPreview} 
                rowKey="previewId"
                columns={[
                  { 
                    title: 'Unit No', 
                    dataIndex: 'unit_number', 
                    key: 'unit_number',
                    render: (text: string, record: any) => (
                      <Input 
                        size="small"
                        status={!text ? 'error' : undefined}
                        value={text} 
                        onChange={(e) => handlePreviewCellChange(record.previewId, 'unit_number', e.target.value)}
                        placeholder="Required"
                      />
                    )
                  },
                  { 
                    title: 'Owner Name', 
                    dataIndex: 'owner_name', 
                    key: 'owner_name',
                    render: (text: string, record: any) => (
                      <Input 
                        size="small"
                        status={!text ? 'error' : undefined}
                        value={text} 
                        onChange={(e) => handlePreviewCellChange(record.previewId, 'owner_name', e.target.value)}
                        placeholder="Required"
                      />
                    )
                  },
                  { 
                    title: 'Type', 
                    dataIndex: 'unit_type', 
                    key: 'unit_type',
                    render: (text: string, record: any) => (
                      <Select
                        size="small"
                        value={text}
                        onChange={(val) => handlePreviewCellChange(record.previewId, 'unit_type', val)}
                        style={{ width: '100%' }}
                      >
                        <Option value="Residential">Residential</Option>
                        <Option value="Commercial">Commercial</Option>
                        <Option value="Plot">Plot</Option>
                      </Select>
                    )
                  },
                  { 
                    title: 'Wing', 
                    dataIndex: 'wing', 
                    key: 'wing',
                    render: (text: string, record: any) => (
                      <Input 
                        size="small"
                        value={text} 
                        onChange={(e) => handlePreviewCellChange(record.previewId, 'wing', e.target.value)}
                      />
                    )
                  },
                  { 
                    title: 'Area', 
                    dataIndex: 'area_sqft', 
                    key: 'area_sqft',
                    width: 100,
                    render: (text: number, record: any) => (
                      <InputNumber 
                        size="small"
                        value={text} 
                        onChange={(val) => handlePreviewCellChange(record.previewId, 'area_sqft', val)}
                        style={{ width: '100%' }}
                      />
                    )
                  },
                  { 
                    title: 'Status', 
                    dataIndex: 'status', 
                    key: 'status',
                    render: (text: string, record: any) => (
                      <Select
                        size="small"
                        value={text}
                        onChange={(val) => handlePreviewCellChange(record.previewId, 'status', val)}
                        style={{ width: '100%' }}
                      >
                        <Option value="Occupied">Occupied</Option>
                        <Option value="Vacant">Vacant</Option>
                      </Select>
                    )
                  },
                  { 
                    title: 'Contact', 
                    dataIndex: 'contact_number', 
                    key: 'contact_number',
                    render: (text: string, record: any) => (
                      <Input 
                        size="small"
                        value={text} 
                        onChange={(e) => handlePreviewCellChange(record.previewId, 'contact_number', e.target.value)}
                      />
                    )
                  },
                ]}
                scroll={{ x: true }}
                style={{ marginTop: 8 }}
              />
            </div>
          )}
          
          {importData.length > 0 && mappedPreview.length === 0 && (
            <Alert 
              message="No units recognized" 
              description="Could not find any unit numbers in the uploaded file. Please make sure your Excel has a column for Unit Number or Flat Number." 
              type="warning" 
              showIcon 
            />
          )}
        </Space>
      </Modal>

      <Modal
        title={editingUnit ? 'Edit Unit' : 'Add Unit'}
        open={isModalOpen}
        onOk={handleModalOk}
        onCancel={() => setIsModalOpen(false)}
        width={600}
      >
        <Form 
          form={form} 
          layout="vertical"
          initialValues={{ unit_type: 'Residential', status: 'Occupied' }}
        >
          <Divider orientation={"left" as any} style={{ marginTop: 0 }}>Unit Information</Divider>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <Form.Item name="project_id" label="Project" rules={[{ required: true }]} style={{ gridColumn: 'span 2' }}>
              <Select>
                {projects.map((s) => (
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
            <Form.Item name="unit_type" label="Unit Type" rules={[{ required: true }]}>
              <Select>
                <Option value="Residential">Residential</Option>
                <Option value="Commercial">Commercial</Option>
                <Option value="Plot">Plot</Option>
              </Select>
            </Form.Item>
            <Form.Item name="area_sqft" label="Area (sqft)" rules={[{ required: true }]}>
              <InputNumber style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="status" label="Status" rules={[{ required: true }]}>
              <Select>
                <Option value="Occupied">Occupied</Option>
                <Option value="Vacant">Vacant</Option>
              </Select>
            </Form.Item>
          </div>

          <Divider orientation={"left" as any}>Owner Information</Divider>
          <Form.Item name="owner_name" label="Owner Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <Form.Item name="contact_number" label="Contact Number">
              <Input />
            </Form.Item>
            <Form.Item name="email" label="Email">
              <Input />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default Units;
