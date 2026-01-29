import React, { useState, useEffect } from 'react'
import { Card, Row, Col, Statistic, Typography, Table, Select, Space, Button } from 'antd'
import { FileExcelOutlined, ProjectOutlined } from '@ant-design/icons'
import * as XLSX from 'xlsx'
import dayjs from 'dayjs'

import { Project } from '@preload/types'

const { Title, Text } = Typography
const { Option } = Select

interface PivotData {
  key: string
  unit_number: string
  owner_name: string
  project_name: string
  [year: string]: any // Dynamically add year columns
  total_billed: number
  total_paid: number
  outstanding: number
}

const Reports: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<number | null>(null)
  const [pivotData, setPivotData] = useState<PivotData[]>([])
  const [years, setYears] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState({
    totalBilled: 0,
    totalCollected: 0,
    outstanding: 0
  })

  const fetchData = async () => {
    setLoading(true)
    try {
      const [allProjects, allUnits, allLetters, allPayments] = await Promise.all([
        window.api.projects.getAll(),
        window.api.units.getAll(),
        window.api.letters.getAll(),
        window.api.payments.getAll()
      ])

      setProjects(allProjects)

      // Filter by project if selected
      const filteredUnits = selectedProject
        ? allUnits.filter((u) => u.project_id === selectedProject)
        : allUnits
      const filteredLetters = selectedProject
        ? allLetters.filter((l) => l.project_id === selectedProject)
        : allLetters
      const filteredPayments = selectedProject
        ? allPayments.filter((p) => p.project_id === selectedProject)
        : allPayments

      // Get unique years
      const uniqueYears = Array.from(new Set(allLetters.map((l) => l.financial_year))).sort()
      setYears(uniqueYears)

      // Calculate stats
      const totalBilled = filteredLetters.reduce((sum, l) => sum + l.final_amount, 0)
      const totalCollected = filteredPayments.reduce((sum, p) => sum + p.payment_amount, 0)
      setStats({
        totalBilled,
        totalCollected,
        outstanding: totalBilled - totalCollected
      })

      // Prepare pivot data
      const data: PivotData[] = filteredUnits.map((unit) => {
        const row: PivotData = {
          key: String(unit.id),
          unit_number: unit.unit_number,
          owner_name: unit.owner_name,
          project_name: unit.project_name || 'N/A',
          total_billed: 0,
          total_paid: 0,
          outstanding: 0
        }

        uniqueYears.forEach((year) => {
          const letter = filteredLetters.find((l) => l.unit_id === unit.id && l.financial_year === year)
          const paymentsForYear = filteredPayments.filter(
            (p) => p.unit_id === unit.id && p.financial_year === year
          )
          
          const billed = letter ? letter.final_amount : 0
          const paid = paymentsForYear.reduce((sum, p) => sum + p.payment_amount, 0)
          
          row[year] = { billed, paid, balance: billed - paid }
          row.total_billed += billed
          row.total_paid += paid
        })

        row.outstanding = row.total_billed - row.total_paid
        return row
      })

      setPivotData(data)
    } catch (error) {
      console.error('Failed to fetch report data', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [selectedProject])

  const exportToExcel = () => {
    const exportData = pivotData.map((row) => {
      const exportRow: any = {
        Project: row.project_name,
        Unit: row.unit_number,
        Owner: row.owner_name
      }
      years.forEach((year) => {
        exportRow[`${year} Billed`] = row[year]?.billed || 0
        exportRow[`${year} Paid`] = row[year]?.paid || 0
        exportRow[`${year} Balance`] = row[year]?.balance || 0
      })
      exportRow['Total Billed'] = row.total_billed
      exportRow['Total Paid'] = row.total_paid
      exportRow['Total Outstanding'] = row.outstanding
      return exportRow
    })

    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Financial Report')
    XLSX.writeFile(wb, `Financial_Report_${dayjs().format('YYYY-MM-DD')}.xlsx`)
  }

  const columns = [
    {
      title: 'Unit',
      dataIndex: 'unit_number',
      key: 'unit_number',
      fixed: 'left' as const,
      width: 100
    },
    {
      title: 'Owner',
      dataIndex: 'owner_name',
      key: 'owner_name',
      fixed: 'left' as const,
      width: 150,
      ellipsis: true
    },
    ...years.map((year) => ({
      title: year,
      children: [
        {
          title: 'Bal',
          key: `${year}_bal`,
          width: 100,
          align: 'right' as const,
          render: (row: PivotData) => {
            const val = row[year]?.balance || 0
            return (
              <Text type={val > 0 ? 'danger' : 'success'} style={{ fontSize: '12px' }}>
                {val > 0 ? `₹${val.toLocaleString()}` : '-'}
              </Text>
            )
          }
        }
      ]
    })),
    {
      title: 'Total Outstanding',
      dataIndex: 'outstanding',
      key: 'outstanding',
      fixed: 'right' as const,
      width: 120,
      align: 'right' as const,
      render: (val: number) => (
        <Text strong type={val > 0 ? 'danger' : 'success'}>
          ₹{val.toLocaleString()}
        </Text>
      ),
      sorter: (a: PivotData, b: PivotData) => a.outstanding - b.outstanding
    }
  ]

  return (
    <div style={{ padding: '0 8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={2} style={{ margin: 0 }}>Financial Reports</Title>
        <Space>
          <Select
            placeholder="Filter by Project"
            style={{ width: 250 }}
            allowClear
            onChange={setSelectedProject}
            value={selectedProject}
            prefix={<ProjectOutlined />}
          >
            {projects.map((p) => (
              <Option key={p.id} value={p.id}>{p.name}</Option>
            ))}
          </Select>
          <Button icon={<FileExcelOutlined />} onClick={exportToExcel} disabled={pivotData.length === 0}>
            Export Excel
          </Button>
        </Space>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card bordered={false} className="report-stat-card billed">
            <Statistic
              title="TOTAL BILLED"
              value={stats.totalBilled}
              precision={0}
              prefix="₹"
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card bordered={false} className="report-stat-card collected">
            <Statistic
              title="TOTAL COLLECTED"
              value={stats.totalCollected}
              precision={0}
              prefix="₹"
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card bordered={false} className="report-stat-card outstanding">
            <Statistic
              title="TOTAL OUTSTANDING"
              value={stats.outstanding}
              precision={0}
              prefix="₹"
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
      </Row>

      <Card title="Unit-wise Pivot Ledger" bodyStyle={{ padding: 0 }}>
        <Table
          columns={columns as any}
          dataSource={pivotData}
          loading={loading}
          pagination={{ pageSize: 20 }}
          scroll={{ x: 'max-content', y: 'calc(100vh - 450px)' }}
          size="small"
          bordered
        />
      </Card>
    </div>
  )
}

export default Reports
