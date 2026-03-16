import { notification } from 'antd'
import { useNavigate } from 'react-router-dom'
import { Button } from 'antd'

/**
 * Provides consistent next-step guidance across all sections
 */
export const showNextStep = (
  section: 'projects' | 'units' | 'billing' | 'payments' | 'reports',
  navigate: ReturnType<typeof useNavigate>,
  customMessage?: string
): void => {
  const nextSteps = {
    projects: {
      message: customMessage || 'Next Step: Add Units',
      description: 'Project has been created successfully. You can now add units to this project.',
      action: () => navigate('/units')
    },
    units: {
      message: customMessage || 'Next Step: Generate Maintenance Letters',
      description: 'Units have been imported successfully. You can now generate maintenance letters for these units.',
      action: () => navigate('/billing')
    },
    billing: {
      message: customMessage || 'Next Step: Record Payments',
      description: 'Letters are created with Pending status. Status changes to Paid only after recording payment in the Payments & Receipts page.',
      action: () => navigate('/payments')
    },
    payments: {
      message: customMessage || 'Next Step: View Reports',
      description: 'Payments have been recorded successfully. You can now view financial reports to analyze collections.',
      action: () => navigate('/reports')
    },
    reports: {
      message: customMessage || 'Export Complete',
      description: 'Financial report has been exported successfully. You can share this file with stakeholders or archive it for future reference.',
      action: undefined // Reports is typically an end-of-workflow step
    }
  }
  
  const nextStep = nextSteps[section]
  if (nextStep) {
    const notificationConfig: any = {
      message: nextStep.message,
      description: nextStep.description,
      duration: 10
    }
    
    if (nextStep.action) {
      notificationConfig.btn = (
        <Button
          type="primary"
          size="small"
          onClick={() => nextStep.action()}
          style={{ marginLeft: 8 }}
        >
          Go to {section.charAt(0).toUpperCase() + section.slice(1)}
        </Button>
      )
    }
    
    notification.info(notificationConfig)
  }
}

/**
 * Shows completion message with optional next-step guidance
 */
export const showCompletionWithNextStep = (
  section: 'projects' | 'units' | 'billing' | 'payments' | 'reports',
  action: string,
  navigate: ReturnType<typeof useNavigate>,
  details?: string
): void => {
  // Show success message first
  const actionMessages = {
    projects: 'Project created/updated successfully',
    units: 'Units imported successfully',
    billing: 'Maintenance letters generated successfully',
    payments: 'Payments recorded successfully',
    reports: 'Report exported successfully'
  }
  
  const message = actionMessages[section] + (details ? `: ${details}` : '')
  
  // Show next-step guidance after a short delay
  setTimeout(() => {
    showNextStep(section, navigate)
  }, 1000)
}
