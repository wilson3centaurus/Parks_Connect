const cron = require('node-cron');

const { sendMail } = require('./mailer');
const environmentModel = require('../models/environmentModel');
const parkModel = require('../models/parkModel');
const infrastructureModel = require('../models/infrastructureModel');
const alertModel = require('../models/alertModel');
const userModel = require('../models/userModel');
const notificationModel = require('../models/notificationModel');
const { logActivity } = require('../middleware/logger');

let scheduledTask;

async function createAndDispatchAlert({ parkId, type, severity, title, description }) {
  const existingAlert = await alertModel.findExistingActive({ parkId, type, title });

  if (existingAlert) {
    return existingAlert.id;
  }

  const alertId = await alertModel.createAlert({
    parkId,
    type,
    severity,
    title,
    description,
    triggeredBy: 'system',
    createdBy: null
  });

  const recipients = await userModel.getUsersForAlertPark(parkId);

  if (recipients.length) {
    await alertModel.insertRecipients(
      alertId,
      recipients.map((recipient) => ({
        userId: recipient.id,
        notifiedVia: 'email'
      }))
    );

    await notificationModel.createBulk(
      recipients.map((recipient) => ({
        userId: recipient.id,
        title,
        message: description,
        type: 'alert',
        link: `/alerts?highlight=${alertId}`
      }))
    );

    await Promise.all(
      recipients.map((recipient) =>
        sendMail({
          to: recipient.email,
          subject: `[ZimParks Alert] ${title}`,
          text: `${description}\n\nView alert: /alerts?highlight=${alertId}`,
          html: `<p>${description}</p><p><strong>Alert ID:</strong> ${alertId}</p>`
        }).catch((error) => {
          console.error(`Failed to email ${recipient.email}:`, error.message);
          return false;
        })
      )
    );
  }

  await logActivity(
    null,
    'alert_created',
    'alerts',
    `System created ${type} alert for park #${parkId}: ${title}`
  );

  return alertId;
}

async function checkAutomatedAlerts() {
  const droughtCandidates = await environmentModel.getDroughtCandidates();
  for (const candidate of droughtCandidates) {
    await createAndDispatchAlert({
      parkId: candidate.park_id,
      type: 'drought',
      severity: 'critical',
      title: `Critical drought index at ${candidate.park_name}`,
      description: `Drought index reached ${candidate.max_value} within the last 24 hours.`
    });
  }

  const nearCapacityParks = await parkModel.getParksNearCapacity();
  for (const park of nearCapacityParks) {
    await createAndDispatchAlert({
      parkId: park.id,
      type: 'capacity_threshold',
      severity: 'high',
      title: `${park.name} nearing visitor capacity`,
      description: `Current visitors (${park.current_visitors}) are at or above 90% of capacity (${park.capacity}).`
    });
  }

  const failedInfrastructure = await infrastructureModel.getRecentFailedReports();
  for (const item of failedInfrastructure) {
    await createAndDispatchAlert({
      parkId: item.park_id,
      type: 'infrastructure_failure',
      severity: 'high',
      title: `Infrastructure failure reported at ${item.park_name}`,
      description: `${item.name} (${item.type}) was reported as failed within the last hour.`
    });
  }

  const offlineSensors = await environmentModel.getSensorOfflineParks();
  for (const park of offlineSensors) {
    await createAndDispatchAlert({
      parkId: park.id,
      type: 'infrastructure_failure',
      severity: 'medium',
      title: 'Sensor offline',
      description: `No environmental readings have been recorded for ${park.name} in the last 48 hours.`
    });
  }
}

function scheduleAlertMonitoring() {
  if (scheduledTask) {
    return scheduledTask;
  }

  scheduledTask = cron.schedule('*/15 * * * *', async () => {
    try {
      await checkAutomatedAlerts();
    } catch (error) {
      console.error('Automated alert checker failed:', error.message);
    }
  });

  checkAutomatedAlerts().catch((error) => console.error('Initial alert check failed:', error.message));
  return scheduledTask;
}

module.exports = {
  checkAutomatedAlerts,
  scheduleAlertMonitoring
};
