import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Typography, Table, Tag } from 'antd';
import { ArrowDownOutlined, TableOutlined, HomeOutlined } from '@ant-design/icons';

const { Title } = Typography;

const Reports: React.FC = () => {
  const [stats, setStats] = useState({
    totalProjects: 0,
    totalUnits: 0,
    totalBilled: 0,
    totalCollected: 0,
    pendingAmount: 0,
  });
  const [recentLetters, setRecentLetters] = useState<any[]>([]);
  const [unitStatus, setUnitStatus] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const [projects, units, letters, payments] = await Promise.all([
          window.api.projects.getAll(),
          window.api.units.getAll(),
          window.api.letters.getAll(),
          window.api.payments.getAll(),
        ]);

        const totalBilled = letters.reduce((sum, lettr) => sum + lettr.final_amount, 0);
        const totalCollected = payments.reduce((sum, pay) => sum + pay.amount_paid, 0);

        setStats({
          totalProjects: projects.length,
          totalUnits: units.length,
          totalBilled,
          totalCollected,
          pendingAmount: totalBilled - totalCollected,
        });

        setRecentLetters(letters.slice(0, 10));

        // Calculate unit-wise status
        const unitData = units.map(unit => {
          const unitLetters = letters.filter(l => l.unit_id === unit.id);
          const unitPayments = payments.filter(p => p.unit_id === unit.id);
          
          const billed = unitLetters.reduce((sum, l) => sum + l.final_amount, 0);
          const collected = unitPayments.reduce((sum, p) => sum + p.payment_amount, 0);
          const project = projects.find(p => p.id === unit.project_id);

          return {
            id: unit.id,
            unit_number: unit.unit_number,
            project_name: project?.name || 'Unknown',
            owner_name: unit.owner_name,
            billed,
            collected,
            outstanding: billed - collected
          };
        }).sort((a, b) => b.outstanding - a.outstanding);

        setUnitStatus(unitData);
      } catch (error) {
        console.error('Failed to fetch stats', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const columns = [
    { title: 'Letter #', dataIndex: 'id', key: 'id' },
    { title: 'Unit', dataIndex: 'unit_number', key: 'unit_number' },
    { title: 'Amount', dataIndex: 'final_amount', key: 'final_amount', render: (val: number) => `₹${val.toFixed(2)}` },
    { 
      title: 'Status', 
      dataIndex: 'status', 
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'Modified' ? 'orange' : 'green'}>{status}</Tag>
      )
    },
  ];

  const unitColumns = [
    { title: 'Project', dataIndex: 'project_name', key: 'project_name' },
    { title: 'Unit', dataIndex: 'unit_number', key: 'unit_number' },
    { title: 'Owner', dataIndex: 'owner_name', key: 'owner_name' },
    { title: 'Billed', dataIndex: 'billed', key: 'billed', render: (val: number) => `₹${val.toFixed(2)}` },
    { title: 'Paid', dataIndex: 'collected', key: 'collected', render: (val: number) => `₹${val.toFixed(2)}` },
    { 
      title: 'Outstanding', 
      dataIndex: 'outstanding', 
      key: 'outstanding', 
      render: (val: number) => (
        <Text type={val > 0 ? 'danger' : 'success'} strong>₹{val.toFixed(2)}</Text>
      )
    },
  ];

  const { Text } = Typography;

  return (
    <div>
      <Title level={2}>Financial Reports</Title>
      
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="Total Projects" value={stats.totalProjects} prefix={<TableOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="Total Units" value={stats.totalUnits} prefix={<HomeOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="Total Billed" value={stats.totalBilled} precision={2} prefix="₹" />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="Total Collected" value={stats.totalCollected} precision={2} prefix="₹" valueStyle={{ color: '#3f8600' }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col xs={24} lg={10}>
          <Card title="Recent Letters">
            <Table 
              columns={columns} 
              dataSource={recentLetters} 
              rowKey="id" 
              pagination={{ pageSize: 5 }}
              size="small"
              loading={loading}
              scroll={{ x: 'max-content' }}
            />
          </Card>
          <Card title="Outstanding Balance" style={{ marginTop: 16 }}>
            <Statistic
              title="Total Pending"
              value={stats.pendingAmount}
              precision={2}
              valueStyle={{ color: '#cf1322' }}
              prefix={<ArrowDownOutlined />}
              suffix="₹"
            />
            <p style={{ marginTop: 16, color: '#666' }}>
              Collection Rate: {stats.totalBilled > 0 
                ? ((stats.totalCollected / stats.totalBilled) * 100).toFixed(1) 
                : 0}%
            </p>
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card title="Unit-wise Outstanding Status">
            <Table 
              columns={unitColumns} 
              dataSource={unitStatus} 
              rowKey="id" 
              pagination={{ pageSize: 10 }}
              size="small"
              loading={loading}
              scroll={{ x: 'max-content' }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Reports;
