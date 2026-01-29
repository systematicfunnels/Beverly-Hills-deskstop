import React, { useState, useEffect } from 'react'
import { Row, Col, Card, Statistic, Typography, Skeleton, message, Select, Space } from 'antd'
import { useNavigate } from 'react-router-dom'
import {
  HomeOutlined,
  UserOutlined,
  FileTextOutlined,
  DollarCircleOutlined,
  ArrowRightOutlined,
  ProjectOutlined
} from '@ant-design/icons'
import { Project } from '@preload/types'

import dayjs from 'dayjs'

const { Title, Text } = Typography
const { Option } = Select

const Dashboard: React.FC = () => {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<number | undefined>(undefined)
  const [selectedUnitType, setSelectedUnitType] = useState<string | undefined>(undefined)
  const [selectedStatus, setSelectedStatus] = useState<string | undefined>(undefined)
  
  // Default to current financial year
  const currentYear = dayjs().month() < 3 ? dayjs().year() - 1 : dayjs().year()
  const defaultFY = `${currentYear}-${(currentYear + 1).toString().slice(2)}`
  const [selectedFY, setSelectedFY] = useState<string>(defaultFY)

  const [stats, setStats] = useState({
    projects: 0,
    units: 0,
    pendingUnits: 0,
    collectedThisYear: 0,
    totalBilled: 0,
    totalOutstanding: 0
  })

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const data = await window.api.projects.getAll()
        setProjects(data)
      } catch (error) {
        console.error('Failed to fetch projects', error)
      }
    }
    fetchProjects()
  }, [])

  useEffect(() => {
    const fetchDashboardData = async (): Promise<void> => {
      setLoading(true)
      try {
        const data = await window.api.projects.getDashboardStats()
        setStats(data)
      } catch (error) {
        console.error('Dashboard data fetch failed', error)
        message.error('Failed to load dashboard statistics')
      } finally {
        setLoading(false)
      }
    }

    fetchDashboardData()
  }, [selectedProject, selectedFY, selectedUnitType, selectedStatus])

  // Generate a range of financial years for the filter
  const financialYears: string[] = []
  const startYear = 2024 // Application start year
  const endYear = currentYear + 1
  for (let y = startYear; y <= endYear; y++) {
    financialYears.push(`${y}-${(y + 1).toString().slice(2)}`)
  }

  const statCards = [
    {
      title: 'PROJECTS',
      value: stats.projects,
      icon: <HomeOutlined style={{ color: '#2D7A5E' }} />,
      color: '#2D7A5E',
      path: '/projects'
    },
    {
      title: 'UNITS',
      value: stats.units,
      icon: <UserOutlined style={{ color: '#2D7A5E' }} />,
      color: '#2D7A5E',
      path: '/units'
    },
    {
      title: 'PENDING UNITS',
      value: stats.pendingUnits,
      icon: <FileTextOutlined style={{ color: '#cf1322' }} />,
      color: '#cf1322',
      path: '/units'
    },
    {
      title: 'TOTAL OUTSTANDING',
      value: stats.totalOutstanding,
      icon: <DollarCircleOutlined style={{ color: '#cf1322' }} />,
      color: '#cf1322',
      isCurrency: true,
      path: '/reports'
    },
    {
      title: 'COLLECTED (FY)',
      value: stats.collectedThisYear,
      icon: <DollarCircleOutlined style={{ color: '#3f8600' }} />,
      color: '#3f8600',
      isCurrency: true,
      path: '/payments'
    }
  ]

  return (
    <div style={{ margin: '0 auto' }}>
      <div style={{ marginBottom: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <Title level={2} style={{ margin: 0, fontWeight: 700 }}>
            Dashboard
          </Title>
          <Text type="secondary" style={{ fontSize: 16 }}>
            Welcome back! Summary for Financial Year <strong>{selectedFY}</strong>
          </Text>
        </div>
        <Space size="middle" wrap>
          <Space direction="vertical" align="start">
            <Text type="secondary" strong style={{ fontSize: 12 }}>Project</Text>
            <Select
              placeholder="All Projects"
              style={{ width: 180 }}
              allowClear
              onChange={(value) => setSelectedProject(value)}
              value={selectedProject}
              suffixIcon={<ProjectOutlined />}
            >
              {projects.map((p) => (
                <Option key={p.id} value={p.id}>
                  {p.name}
                </Option>
              ))}
            </Select>
          </Space>
          <Space direction="vertical" align="start">
            <Text type="secondary" strong style={{ fontSize: 12 }}>Financial Year</Text>
            <Select
              placeholder="Select Year"
              style={{ width: 120 }}
              onChange={(value) => setSelectedFY(value)}
              value={selectedFY}
            >
              {financialYears.map((fy) => (
                <Option key={fy} value={fy}>
                  {fy}
                </Option>
              ))}
            </Select>
          </Space>
          <Space direction="vertical" align="start">
            <Text type="secondary" strong style={{ fontSize: 12 }}>Unit Type</Text>
            <Select
              placeholder="All Types"
              style={{ width: 130 }}
              allowClear
              onChange={setSelectedUnitType}
              value={selectedUnitType}
            >
              <Option value="Residential">Residential</Option>
              <Option value="Commercial">Commercial</Option>
              <Option value="Plot">Plot</Option>
              <Option value="Bungalow">Bungalow</Option>
              <Option value="Flat">Flat</Option>
            </Select>
          </Space>
          <Space direction="vertical" align="start">
            <Text type="secondary" strong style={{ fontSize: 12 }}>Status</Text>
            <Select
              placeholder="All Status"
              style={{ width: 120 }}
              allowClear
              onChange={setSelectedStatus}
              value={selectedStatus}
            >
              <Option value="Active">Active</Option>
              <Option value="Inactive">Inactive</Option>
            </Select>
          </Space>
        </Space>
      </div>

      <Row gutter={[24, 24]}>
        {statCards.map((card, index) => (
          <Col key={index} xs={24} sm={12} lg={index >= 3 ? 6 : 4}>
            <Card
              bordered={false}
              hoverable
              className="admin-stat-card"
              onClick={() => navigate(card.path)}
              style={{ height: '100%' }}
            >
              <Skeleton loading={loading} active paragraph={{ rows: 1 }}>
                <Statistic
                  title={
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text type="secondary" strong style={{ fontSize: 12 }}>
                        {card.title}
                      </Text>
                      <ArrowRightOutlined style={{ fontSize: 12, color: '#bfbfbf' }} />
                    </div>
                  }
                  value={card.value}
                  prefix={card.icon}
                  precision={card.isCurrency ? 2 : 0}
                  valueStyle={{ color: card.color, fontWeight: 700 }}
                />
              </Skeleton>
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
        <Col xs={24}>
          <Card
            title="Quick Actions"
            bordered={false}
            headStyle={{ borderBottom: '1px solid #f0f0f0' }}
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={8}>
                <Card
                  hoverable
                  size="small"
                  style={{
                    textAlign: 'center',
                    background: '#f6ffed',
                    border: '1px solid #b7eb8f',
                    borderRadius: 4
                  }}
                  onClick={() => navigate('/billing')}
                >
                  <Title level={5} style={{ margin: '8px 0' }}>
                    Generate Letters
                  </Title>
                  <Text type="secondary">Process annual maintenance</Text>
                </Card>
              </Col>
              <Col xs={24} sm={8}>
                <Card
                  hoverable
                  size="small"
                  style={{
                    textAlign: 'center',
                    background: '#e6f7ff',
                    border: '1px solid #91d5ff',
                    borderRadius: 4
                  }}
                  onClick={() => navigate('/units')}
                >
                  <Title level={5} style={{ margin: '8px 0' }}>
                    Add Unit
                  </Title>
                  <Text type="secondary">Register new unit/owner</Text>
                </Card>
              </Col>
              <Col xs={24} sm={8}>
                <Card
                  hoverable
                  size="small"
                  style={{
                    textAlign: 'center',
                    background: '#fff7e6',
                    border: '1px solid #ffd591',
                    borderRadius: 4
                  }}
                  onClick={() => navigate('/payments')}
                >
                  <Title level={5} style={{ margin: '8px 0' }}>
                    Record Payment
                  </Title>
                  <Text type="secondary">Update collection status</Text>
                </Card>
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default Dashboard
