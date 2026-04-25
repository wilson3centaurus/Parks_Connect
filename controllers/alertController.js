const { validationResult } = require('express-validator');

const alertModel = require('../models/alertModel');
const notificationModel = require('../models/notificationModel');
const parkModel = require('../models/parkModel');
const userModel = require('../models/userModel');
const { sendMail } = require('../config/mailer');
const { logActivity } = require('../middleware/logger');

function clean(value) {
  return String(value || '').trim().replace(/[<>]/g, '');
}

function mapErrors(req) {
  return validationResult(req).array().map((error) => ({ field: error.path, msg: error.msg }));
}

function parsePagination(query) {
  return {
    page: Math.max(Number(query.page) || 1, 1),
    limit: Math.min(Math.max(Number(query.limit) || 10, 1), 100)
  };
}

function buildPagination(basePath, query, page, limit, total) {
  const totalPages = Math.max(Math.ceil(total / limit), 1);
  const buildUrl = (nextPage) => {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    params.set('page', nextPage);
    params.set('limit', limit);
    return `${basePath}?${params.toString()}`;
  };

  return {
    page,
    limit,
    total,
    totalPages,
    prevUrl: page > 1 ? buildUrl(page - 1) : null,
    nextUrl: page < totalPages ? buildUrl(page + 1) : null
  };
}

function renderLayout(res, view, options = {}) {
  return res.status(options.status || 200).render('layout', {
    title: options.title || 'Alerts',
    view,
    pageScripts: [],
    includeChartJs: false,
    errors: options.errors || [],
    formData: options.formData || {},
    ...options
  });
}

async function dispatchAlert(alertId, title, description, parkId) {
  const recipients = await userModel.getUsersForAlertPark(parkId);

  if (!recipients.length) {
    return;
  }

  await alertModel.insertRecipients(
    alertId,
    recipients.map((recipient) => ({ userId: recipient.id, notifiedVia: 'email' }))
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
        text: `${description}\n\nAlert ID: ${alertId}`,
        html: `<p>${description}</p><p><strong>Alert ID:</strong> ${alertId}</p>`
      }).catch((error) => {
        console.error(`Failed to send alert email to ${recipient.email}:`, error.message);
        return false;
      })
    )
  );
}

async function renderIndexPage(req, res, options = {}) {
  const { page, limit } = parsePagination(req.query);
  const parkIds = await parkModel.getAccessibleParkIds(req.session.user.id, req.session.user.role);
  const filters = {
    status: clean(req.query.status),
    severity: clean(req.query.severity),
    type: clean(req.query.type)
  };
  const { rows, total } = await alertModel.listAlerts({
    page,
    limit,
    status: filters.status,
    severity: filters.severity,
    type: filters.type,
    parkIds
  });

  return renderLayout(res, 'alerts/index', {
    title: 'Alerts',
    alerts: rows,
    filters,
    pagination: buildPagination('/alerts', filters, page, limit, total),
    errors: options.errors || [],
    formData: options.formData || {},
    status: options.status || 200
  });
}

async function renderCreatePage(req, res, options = {}) {
  const parks = await parkModel.getAccessibleParks(req.session.user.id, req.session.user.role);
  return renderLayout(res, 'alerts/create', {
    title: 'Create Alert',
    parks,
    errors: options.errors || [],
    formData: options.formData || {},
    status: options.status || 200
  });
}

exports.renderIndex = async (req, res, next) => {
  try {
    return await renderIndexPage(req, res);
  } catch (error) {
    return next(error);
  }
};

exports.renderCreateForm = async (req, res, next) => {
  try {
    return await renderCreatePage(req, res);
  } catch (error) {
    return next(error);
  }
};

exports.create = async (req, res, next) => {
  try {
    const formData = {
      parkId: clean(req.body.parkId),
      type: clean(req.body.type),
      severity: clean(req.body.severity),
      title: clean(req.body.title),
      description: clean(req.body.description)
    };
    const errors = mapErrors(req);
    const hasAccess = await parkModel.hasAccess(req.session.user.id, req.session.user.role, Number(formData.parkId));

    if (!hasAccess) {
      errors.push({ field: 'parkId', msg: 'You are not allowed to create alerts for this park.' });
    }

    if (errors.length) {
      return await renderCreatePage(req, res, { status: 422, errors, formData });
    }

    const alertId = await alertModel.createAlert({
      parkId: Number(formData.parkId),
      type: formData.type,
      severity: formData.severity,
      title: formData.title,
      description: formData.description,
      triggeredBy: 'manual',
      createdBy: req.session.user.id
    });

    await dispatchAlert(alertId, formData.title, formData.description, Number(formData.parkId));
    await logActivity(req.session.user.id, 'alert_created', 'alerts', `Created alert #${alertId} for park #${formData.parkId}.`, req);
    return res.redirect('/alerts');
  } catch (error) {
    return next(error);
  }
};

exports.acknowledge = async (req, res, next) => {
  try {
    const errors = mapErrors(req);
    const alert = await alertModel.getById(Number(req.params.id));

    if (!alert) {
      errors.push({ field: 'id', msg: 'Alert not found.' });
    } else if (req.session.user.role === 'ranger') {
      const hasAccess = await parkModel.hasAccess(req.session.user.id, req.session.user.role, alert.park_id);
      if (!hasAccess) {
        errors.push({ field: 'id', msg: 'You are not allowed to acknowledge this alert.' });
      }
    }

    if (errors.length) {
      return await renderIndexPage(req, res, { status: 422, errors, formData: { id: req.params.id } });
    }

    await alertModel.acknowledgeAlert(Number(req.params.id));
    await logActivity(req.session.user.id, 'alert_acknowledged', 'alerts', `Acknowledged alert #${req.params.id}.`, req);
    return res.redirect('/alerts');
  } catch (error) {
    return next(error);
  }
};

exports.resolve = async (req, res, next) => {
  try {
    const errors = mapErrors(req);
    const alert = await alertModel.getById(Number(req.params.id));

    if (!alert) {
      errors.push({ field: 'id', msg: 'Alert not found.' });
    }

    if (errors.length) {
      return await renderIndexPage(req, res, { status: 422, errors, formData: { id: req.params.id } });
    }

    await alertModel.resolveAlert(Number(req.params.id));
    await logActivity(req.session.user.id, 'alert_resolved', 'alerts', `Resolved alert #${req.params.id}.`, req);
    return res.redirect('/alerts');
  } catch (error) {
    return next(error);
  }
};

exports.markNotificationRead = async (req, res, next) => {
  try {
    const errors = mapErrors(req);
    if (errors.length) {
      return await renderIndexPage(req, res, { status: 422, errors, formData: { id: req.params.id } });
    }

    await notificationModel.markAsRead(Number(req.params.id), req.session.user.id);
    return res.redirect(req.get('referer') || '/dashboard');
  } catch (error) {
    return next(error);
  }
};
