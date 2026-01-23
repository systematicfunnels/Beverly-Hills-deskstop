import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Statistic, Typography, List, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import { 
  HomeOutlined, 
  UserOutlined, 
  FileTextOutlined, 
  DollarCircleOutlined,
  HistoryOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    projects: 0,
    units: 0,
    unpaidLetters: 0,
    monthlyCollection: 0,
    totalBilled: 0
  });
  const [recentActivities, setRecentActivities] = useState<any[]>([]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [projects, units, letters, payments] = await Promise.all([
          window.api.projects.getAll(),
          window.api.units.getAll(),
          window.api.letters.getAll(),
          window.api.payments.getAll()
        ]);

        const currentMonth = dayjs().month() + 1;
        const currentYear = dayjs().year();

        const monthlyCollection = payments
          .filter(p => dayjs(p.payment_date).month() + 1 === currentMonth && dayjs(p.payment_date).year() === currentYear)
          .reduce((sum, p) => sum + p.amount_paid, 0);

        const totalBilled = letters.reduce((sum, l) => sum + l.final_amount, 0);

        setStats({
          projects: projects.length,
          units: units.length,
          unpaidLetters: letters.filter(l => l.status === 'Generated' || l.status === 'Modified').length,
          monthlyCollection,
          totalBilled
        });

        // Combine recent letters and payments for activity feed
        const activities = [
          ...letters.slice(0, 5).map(l => ({ type: 'letter', date: l.generated_date, title: `Letter Generated: ${l.unit_number}`, amount: l.final_amount })),
          ...payments.slice(0, 5).map(p => ({ type: 'payment', date: p.payment_date, title: `Payment Received: ${p.unit_number}`, amount: p.amount_paid }))
        ].sort((a, b) => dayjs(b.date).unix() - dayjs(a.date).unix()).slice(0, 6);

        setRecentActivities(activities);
      } catch (error) {
        console.error('Dashboard data fetch failed', error);
      }
    };

    fetchDashboardData();
  }, []);

  return (
    <div style={{ margin: '0 auto' }}>
      <div style={{ marginBottom: 32 }}>
        <Title level={2} style={{ margin: 0, fontWeight: 700 }}>Dashboard</Title>
        <Text type="secondary" style={{ fontSize: 16 }}>Welcome back! Here's a summary of your operations.</Text>
      </div>
      
      <Row gutter={[24, 24]}>
        <Col xs={24} sm={12} lg={4}>
          <Card bordered={false} className="admin-stat-card">
            <Statistic 
              title={<Text type="secondary" strong>PROJECTS</Text>}
              value={stats.projects} 
              prefix={<HomeOutlined style={{ color: '#2D7A5E' }} />} 
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <Card bordered={false} className="admin-stat-card">
            <Statistic 
              title={<Text type="secondary" strong>UNITS</Text>}
              value={stats.units} 
              prefix={<UserOutlined style={{ color: '#2D7A5E' }} />} 
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <Card bordered={false} className="admin-stat-card">
            <Statistic 
              title={<Text type="secondary" strong>PENDING</Text>}
              value={stats.unpaidLetters} 
              prefix={<FileTextOutlined style={{ color: '#cf1322' }} />} 
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} className="admin-stat-card">
            <Statistic 
              title={<Text type="secondary" strong>TOTAL BILLED</Text>}
              value={stats.totalBilled} 
              prefix={<DollarCircleOutlined style={{ color: '#1890ff' }} />} 
              precision={2}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} className="admin-stat-card">
            <Statistic 
              title={<Text type="secondary" strong>COLLECTION</Text>}
              value={stats.monthlyCollection} 
              prefix={<DollarCircleOutlined style={{ color: '#3f8600' }} />} 
              precision={2}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
        <Col xs={24} lg={16}>
          <Card title="Quick Actions" bordered={false} headStyle={{ borderBottom: '1px solid #f0f0f0' }}>
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={8}>
                <Card 
                  hoverable 
                  size="small" 
                  style={{ textAlign: 'center', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 4 }}
                  onClick={() => navigate('/billing')}
                >
                  <Title level={5} style={{ margin: '8px 0' }}>Generate Letters</Title>
                  <Text type="secondary">Process annual maintenance</Text>
                </Card>
              </Col>
              <Col xs={24} sm={8}>
                <Card 
                  hoverable 
                  size="small" 
                  style={{ textAlign: 'center', background: '#e6f7ff', border: '1px solid #91d5ff', borderRadius: 4 }}
                  onClick={() => navigate('/units')}
                >
                  <Title level={5} style={{ margin: '8px 0' }}>Add Unit</Title>
                  <Text type="secondary">Register new unit/owner</Text>
                </Card>
              </Col>
              <Col xs={24} sm={8}>
                <Card 
                  hoverable 
                  size="small" 
                  style={{ textAlign: 'center', background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 4 }}
                  onClick={() => navigate('/payments')}
                >
                  <Title level={5} style={{ margin: '8px 0' }}>Record Payment</Title>
                  <Text type="secondary">Update collection status</Text>
                </Card>
              </Col>
            </Row>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card 
            title="Recent Activity" 
            bordered={false} 
            extra={<HistoryOutlined />}
            headStyle={{ borderBottom: '1px solid #f0f0f0' }}
          >
            <List
              dataSource={recentActivities}
              renderItem={(item) => (
                <List.Item style={{ padding: '12px 0' }}>
                  <List.Item.Meta
                    title={<Text strong>{item.title}</Text>}
                    description={
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>{item.date}</Text>
                        <Tag color={item.type === 'letter' ? 'orange' : 'green'} style={{ borderRadius: 2, margin: 0 }}>
                          ₹{item.amount.toFixed(2)}
                        </Tag>
                      </div>
                    }
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;
