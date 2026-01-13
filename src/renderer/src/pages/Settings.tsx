import React from 'react';
import { Card, Button, Typography, Space, Divider, message, Alert } from 'antd';
import { DownloadOutlined, UploadOutlined } from '@ant-design/icons';

const { Title, Paragraph, Text } = Typography;

const Settings: React.FC = () => {
  const handleExport = async () => {
    try {
      // In a real app, this would trigger a main process save dialog
      message.info('Database export feature coming soon. Please manually backup database.sqlite');
    } catch (error) {
      message.error('Export failed');
    }
  };

  const handleImport = async () => {
    message.warning('Importing data will overwrite existing records. Please be careful.');
  };

  return (
    <div style={{ maxWidth: 800 }}>
      <Title level={2}>System Settings</Title>
      
      <Card title="Data Management" style={{ marginBottom: 24 }}>
        <Paragraph>
          Manage your local database. All data is stored locally on your machine.
        </Paragraph>
        
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <Title level={5}>Export Database</Title>
            <Text type="secondary">Download a copy of your database for backup or moving to another machine.</Text>
            <div style={{ marginTop: 8 }}>
              <Button icon={<DownloadOutlined />} onClick={handleExport}>
                Backup Database
              </Button>
            </div>
          </div>
          
          <Divider />
          
          <div>
            <Title level={5}>Import Data</Title>
            <Text type="secondary">Restore data from a previously exported backup file.</Text>
            <div style={{ marginTop: 8 }}>
              <Button icon={<UploadOutlined />} onClick={handleImport} disabled>
                Restore from Backup
              </Button>
            </div>
          </div>
        </Space>
      </Card>

      <Card title="About Beverly Hills Billing">
        <Space direction="vertical">
          <Text>Version: 1.0.0</Text>
          <Text>Database Type: SQLite 3</Text>
          <Text>Environment: Desktop Application (Electron)</Text>
          <Alert
            message="Offline Mode"
            description="This application works entirely offline. No data is sent to external servers."
            type="info"
            showIcon
          />
        </Space>
      </Card>
      
      <div style={{ marginTop: 24, textAlign: 'center' }}>
        <Text type="secondary">Designed for residential society management.</Text>
      </div>
    </div>
  );
};

export default Settings;
