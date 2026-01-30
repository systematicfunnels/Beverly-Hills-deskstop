import React, { useState, useEffect, useCallback } from 'react'
import {
  Card,
  Row,
  Col,
  Statistic,
  Typography,
  Table,
  Select,
  Space,
  Button,
  TableProps,
  Tooltip
} from 'antd'
import { FileExcelOutlined, ProjectOutlined, ExclamationCircleOutlined } from '@ant-design/icons'
import ExcelJS from 'exceljs'
import dayjs from 'dayjs'

import { Project } from '@preload/types'

const { Title, Text } = Typography
const { Option } = Select

interface YearlyData {
  billed: number
  paid: number
  balance: number
}

interface PivotData {
  key: string
  unit_number: string
  owner_name: string
  project_name: string
  [year: string]: string | number | YearlyData
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

  const fetchData = useCallback(async (): Promise<void> => {
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
          const letter = filteredLetters.find(
            (l) => l.unit_id === unit.id && l.financial_year === year
          )
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
    } catch {
      // console.error('Failed to fetch report data', error)
    } finally {
      setLoading(false)
    }
  }, [selectedProject])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const exportToExcel = async (): Promise<void> => {
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Financial Report')

    // Define columns
    const columns = [
      { header: 'Project', key: 'Project', width: 20 },
      { header: 'Unit', key: 'Unit', width: 15 },
      { header: 'Owner', key: 'Owner', width: 25 }
    ]

    years.forEach((year) => {
      columns.push({ header: `${year} Billed`, key: `${year}_Billed`, width: 15 })
      columns.push({ header: `${year} Paid`, key: `${year}_Paid`, width: 15 })
      columns.push({ header: `${year} Balance`, key: `${year}_Balance`, width: 15 })
    })

    columns.push({ header: 'Total Billed', key: 'Total_Billed', width: 15 })
    columns.push({ header: 'Total Paid', key: 'Total_Paid', width: 15 })
    columns.push({ header: 'Total Outstanding', key: 'Total_Outstanding', width: 15 })

    worksheet.columns = columns

    // Add rows
    pivotData.forEach((row) => {
      const exportRow: Record<string, string | number> = {
        Project: row.project_name,
        Unit: row.unit_number,
        Owner: row.owner_name,
        Total_Billed: row.total_billed,
        Total_Paid: row.total_paid,
        Total_Outstanding: row.outstanding
      }

      years.forEach((year) => {
        const yearData = row[year] as YearlyData
        exportRow[`${year}_Billed`] = yearData?.billed || 0
        exportRow[`${year}_Paid`] = yearData?.paid || 0
        exportRow[`${year}_Balance`] = yearData?.balance || 0
      })

      worksheet.addRow(exportRow)
    })

    // Style the header
    worksheet.getRow(1).font = { bold: true }

    // Generate buffer and save
    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    })
    const url = window.URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `Financial_Report_${dayjs().format('YYYY-MM-DD')}.xlsx`
    anchor.click()
    window.URL.revokeObjectURL(url)
  }

  const columns = [
    {
      title: 'Project',
      dataIndex: 'project_name',
      key: 'project_name',
      fixed: 'left' as const,
      width: 150,
      ellipsis: true,
      sorter: (a: PivotData, b: PivotData) => (a.project_name || '').localeCompare(b.project_name || '')
    },
    {
      title: 'Unit',
      dataIndex: 'unit_number',
      key: 'unit_number',
      fixed: 'left' as const,
      width: 100,
      sorter: (a: PivotData, b: PivotData) => a.unit_number.localeCompare(b.unit_number)
    },
    {
      title: 'Owner',
      dataIndex: 'owner_name',
      key: 'owner_name',
      fixed: 'left' as const,
      width: 150,
      ellipsis: true,
      sorter: (a: PivotData, b: PivotData) => a.owner_name.localeCompare(b.owner_name)
    },
    ...years.map((year) => ({
      title: year,
      children: [
        {
          title: 'Due',
          key: `${year}_bal`,
          width: 100,
          align: 'right' as const,
          render: (row: PivotData) => {
            const yearData = row[year]
            const val =
              yearData && typeof yearData === 'object' && 'balance' in yearData
                ? (yearData as YearlyData).balance
                : 0
            const billed =
              yearData && typeof yearData === 'object' && 'billed' in yearData
                ? (yearData as YearlyData).billed
                : 0
            const paid =
              yearData && typeof yearData === 'object' && 'paid' in yearData
                ? (yearData as YearlyData).paid
                : 0

            return (
              <Tooltip title={`Billed: ₹${billed.toLocaleString()} | Paid: ₹${paid.toLocaleString()}`}>
                <Text type={val > 0 ? 'danger' : 'success'} style={{ fontSize: '12px' }}>
                  {val > 0 && <ExclamationCircleOutlined style={{ marginRight: 4 }} />}
                  {val > 0 ? `₹${val.toLocaleString()}` : '-'}
                </Text>
              </Tooltip>
            )
          }
        }
      ]
    })),
    {
      title: 'Total Billed',
      dataIndex: 'total_billed',
      key: 'total_billed',
      width: 120,
      align: 'right' as const,
      render: (val: number) => `₹${val.toLocaleString()}`,
      sorter: (a: PivotData, b: PivotData) => a.total_billed - b.total_billed
    },
    {
      title: 'Total Paid',
      dataIndex: 'total_paid',
      key: 'total_paid',
      width: 120,
      align: 'right' as const,
      render: (val: number) => `₹${val.toLocaleString()}`,
      sorter: (a: PivotData, b: PivotData) => a.total_paid - b.total_paid
    },
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
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24
        }}
      >
        <Title level={2} style={{ margin: 0 }}>
          Financial Reports
        </Title>
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
              <Option key={p.id} value={p.id}>
                {p.name}
              </Option>
            ))}
          </Select>
          <Button
            icon={<FileExcelOutlined />}
            onClick={exportToExcel}
            disabled={pivotData.length === 0}
          >
            Export Excel
          </Button>
        </Space>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card bordered={false} className="report-stat-card billed">
            <Statistic title="TOTAL BILLED" value={stats.totalBilled} precision={0} prefix="₹" />
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
          columns={columns as TableProps<PivotData>['columns']}
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
