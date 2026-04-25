const activityLogModel = require('../models/activityLogModel');

async function logActivity(userId, action, moduleName, description, req = null) {
  try {
    const forwarded = req?.headers?.['x-forwarded-for'];
    const ipAddress = forwarded
      ? String(forwarded).split(',')[0].trim()
      : req?.ip || req?.socket?.remoteAddress || 'system';

    await activityLogModel.create({
      userId: userId || null,
      action,
      module: moduleName,
      description,
      ipAddress,
      userAgent: req?.get?.('user-agent') || 'system'
    });
  } catch (error) {
    console.error('Activity logging failed:', error.message);
  }
}

module.exports = {
  logActivity
};
