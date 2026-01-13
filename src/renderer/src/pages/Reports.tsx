import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Typography, Table, Tag } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, BankOutlined, UserOutlined } from '@ant-design/icons';

const { Title } = Typography;

const Reports: React.FC = () => {
  const [stats, setStats] = useState({
    totalSocieties: 0,
    totalResidents: 0,
    totalInvoiced: 0,
    totalCollected: 0,
    pendingAmount: 0,
  });
  const [recentInvoices, setRecentInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const [societies, units, invoices, payments] = await Promise.all([
          window.api.societies.getAll(),
          window.api.units.getAll(),
          window.api.invoices.getAll(),
          window.api.payments.getAll(),
        ]);

        const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.total_amount, 0);
        const totalCollected = payments.reduce((sum, pay) => sum + pay.amount_paid, 0);

        setStats({
          totalSocieties: societies.length,
          totalResidents: units.length,
          totalInvoiced,
          totalCollected,
          pendingAmount: totalInvoiced - totalCollected,
        });

        setRecentInvoices(invoices.slice(0, 5));
      } catch (error) {
        console.error('Failed to fetch stats', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const columns = [
    { title: 'Inv #', dataIndex: 'id', key: 'id' },
    { title: 'Unit', dataIndex: 'unit_number', key: 'unit_number' },
    { title: 'Amount', dataIndex: 'total_amount', key: 'total_amount', render: (val: number) => `₹${val.toFixed(2)}` },
    { 
      title: 'Status', 
      dataIndex: 'status', 
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'Paid' ? 'green' : 'volcano'}>{status}</Tag>
      )
    },
  ];

  return (
    <div>
      <Title level={2}>Financial Reports</Title>
      
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Total Societies"
              value={stats.totalSocieties}
              prefix={<BankOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Total Residents"
              value={stats.totalResidents}
              prefix={<UserOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Total Invoiced"
              value={stats.totalInvoiced}
              precision={2}
              prefix="₹"
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Total Collected"
              value={stats.totalCollected}
              precision={2}
              valueStyle={{ color: '#3f8600' }}
              prefix={<ArrowUpOutlined />}
              suffix="₹"
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col xs={24} lg={12}>
          <Card title="Recent Invoices">
            <Table 
              columns={columns} 
              dataSource={recentInvoices} 
              rowKey="id" 
              pagination={false} 
              size="small"
              loading={loading}
              scroll={{ x: 'max-content' }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Outstanding Balance">
            <Statistic
              title="Total Pending"
              value={stats.pendingAmount}
              precision={2}
              valueStyle={{ color: '#cf1322' }}
              prefix={<ArrowDownOutlined />}
              suffix="₹"
            />
            <p style={{ marginTop: 16, color: '#666' }}>
              Collection Rate: {stats.totalInvoiced > 0 
                ? ((stats.totalCollected / stats.totalInvoiced) * 100).toFixed(1) 
                : 0}%
            </p>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Reports;
