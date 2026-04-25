const { validationResult } = require('express-validator');

const userModel = require('../models/userModel');
const parkModel = require('../models/parkModel');
const wildlifeModel = require('../models/wildlifeModel');
const environmentModel = require('../models/environmentModel');
const feedbackModel = require('../models/feedbackModel');
const alertModel = require('../models/alertModel');
const infrastructureModel = require('../models/infrastructureModel');
const activityLogModel = require('../models/activityLogModel');
const { logActivity } = require('../middleware/logger');

function clean(value) {
  return String(value || '').trim().replace(/[<>]/g, '');
}

function mapErrors(req) {
  return validationResult(req).array().map((error) => ({
    field: error.path,
    msg: error.msg
  }));
}

function parsePagination(query, defaultLimit = 10, pageSizeCap = 100) {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || defaultLimit, 1), pageSizeCap);
  return { page, limit };
}

function buildPagination(basePath, query, page, limit, total) {
  const totalPages = Math.max(Math.ceil(total / limit), 1);
  const makeUrl = (nextPage) => {
    const params = new URLSearchParams();
    Object.entries(query || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.set(key, value);
      }
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
    prevUrl: page > 1 ? makeUrl(page - 1) : null,
    nextUrl: page < totalPages ? makeUrl(page + 1) : null
  };
}

function renderLayout(res, view, options = {}) {
  return res.status(options.status || 200).render('layout', {
    title: options.title || 'ZimParks Platform',
    view,
    pageScripts: options.pageScripts || [],
    includeChartJs: Boolean(options.includeChartJs),
    errors: options.errors || [],
    successMessage: options.successMessage || '',
    formData: options.formData || {},
    ...options
  });
}

function escapeCsv(value) {
  const normalized = value === null || value === undefined ? '' : String(value);
  return `"${normalized.replace(/"/g, '""')}"`;
}

async function renderUsersPage(req, res, options = {}) {
  const { page, limit } = parsePagination(req.query, 10);
  const filters = {
    search: clean(req.query.search),
    role: clean(req.query.role),
    status: clean(req.query.status)
  };

  const [{ rows, total }, parks] = await Promise.all([
    userModel.listUsers({ page, limit, ...filters }),
    parkModel.getAccessibleParks(req.session.user.id, 'admin')
  ]);

  return renderLayout(res, 'admin/users', {
    title: 'User Management',
    users: rows,
    parks,
    filters,
    pagination: buildPagination('/admin/users', filters, page, limit, total),
    errors: options.errors || [],
    formData: options.formData || {},
    status: options.status || 200
  });
}

async function renderParksPage(req, res, options = {}) {
  const { page, limit } = parsePagination(req.query, 10);
  const filters = {
    search: clean(req.query.search),
    status: clean(req.query.status)
  };

  const { rows, total } = await parkModel.listParks({ page, limit, ...filters });

  return renderLayout(res, 'admin/parks', {
    title: 'Park Management',
    parks: rows,
    filters,
    pagination: buildPagination('/admin/parks', filters, page, limit, total),
    errors: options.errors || [],
    formData: options.formData || {},
    status: options.status || 200
  });
}

async function renderLogsPage(req, res, options = {}) {
  const { page, limit } = parsePagination(req.query, 50, 100);
  const filters = {
    user: clean(req.query.user),
    module: clean(req.query.module),
    from: clean(req.query.from),
    to: clean(req.query.to)
  };

  const [{ rows, total }, users] = await Promise.all([
    activityLogModel.list({ page, limit, ...filters }),
    userModel.getUserOptions()
  ]);

  return renderLayout(res, 'admin/logs', {
    title: 'Activity Logs',
    logs: rows,
    users,
    filters,
    pagination: buildPagination('/admin/logs', filters, page, limit, total),
    status: options.status || 200
  });
}

async function renderDashboardPage(req, res, options = {}) {
  const user = req.session.user;

  if (user.role === 'admin') {
    const [totalUsers, totalParks, activeAlerts, recentActivity] = await Promise.all([
      userModel.getTotals(),
      parkModel.getTotalParks(),
      alertModel.countActive(null),
      activityLogModel.getRecent(10)
    ]);

    return renderLayout(res, 'admin/dashboard', {
      title: 'Admin Dashboard',
      totalUsers,
      totalParks,
      activeAlerts,
      recentActivity,
      includeChartJs: true,
      pageScripts: ['/js/analytics.js'],
      quickLinks: [
        { label: 'Users', href: '/admin/users' },
        { label: 'Parks', href: '/admin/parks' },
        { label: 'Wildlife', href: '/wildlife' },
        { label: 'Environment', href: '/environment' },
        { label: 'Infrastructure', href: '/infrastructure' },
        { label: 'Feedback', href: '/feedback/manage' },
        { label: 'Alerts', href: '/alerts' },
        { label: 'Analytics', href: '/analytics' },
        { label: 'Logs', href: '/admin/logs' }
      ],
      errors: options.errors || [],
      formData: options.formData || {}
    });
  }

  const parkIds = await parkModel.getAccessibleParkIds(user.id, user.role);
  const assignedParks = await parkModel.getAccessibleParks(user.id, user.role);

  if (user.role === 'ranger') {
    const [sightingsThisWeek, readingsThisWeek, infrastructureIssues, activeAlerts, recentAlerts] = await Promise.all([
      wildlifeModel.countThisWeek(parkIds),
      environmentModel.countThisWeek(parkIds),
      infrastructureModel.countIssues(parkIds),
      alertModel.countActive(parkIds),
      alertModel.getRecentActive(parkIds, 6)
    ]);

    const recentIssues = await infrastructureModel.getIssuesForDashboard(parkIds, 6);

    return renderLayout(res, 'ranger/dashboard', {
      title: 'Ranger Dashboard',
      assignedParks,
      sightingsThisWeek,
      readingsThisWeek,
      infrastructureIssues,
      activeAlerts,
      recentAlerts,
      recentIssues,
      includeChartJs: true,
      pageScripts: ['/js/analytics.js'],
      quickLinks: [
        { label: 'Wildlife', href: '/wildlife' },
        { label: 'Environment', href: '/environment' },
        { label: 'Infrastructure', href: '/infrastructure' },
        { label: 'Alerts', href: '/alerts' }
      ],
      errors: options.errors || [],
      formData: options.formData || {}
    });
  }

  if (user.role === 'tourism_officer') {
    const [pendingFeedbackCount, averageRatingThisMonth, visitorCounts, recentFeedback, totalVisitorsThisMonth] = await Promise.all([
      feedbackModel.getPendingCount(parkIds),
      feedbackModel.getAverageRatingThisMonth(parkIds),
      parkModel.getVisitorCountPerPark(parkIds),
      feedbackModel.getRecentFeedback(parkIds, 6),
      parkModel.getTotalVisitorsThisMonth(parkIds)
    ]);

    return renderLayout(res, 'tourism_officer/dashboard', {
      title: 'Tourism Officer Dashboard',
      assignedParks,
      pendingFeedbackCount,
      averageRatingThisMonth,
      visitorCounts,
      recentFeedback,
      totalVisitorsThisMonth,
      includeChartJs: true,
      pageScripts: ['/js/analytics.js'],
      quickLinks: [
        { label: 'Feedback', href: '/feedback/manage' },
        { label: 'Analytics', href: '/analytics' },
        { label: 'Dashboard', href: '/dashboard' }
      ],
      errors: options.errors || [],
      formData: options.formData || {}
    });
  }

  const [totalSightingsThisMonth, averageFeedbackRating, activeAlerts, totalVisitorsThisMonth] = await Promise.all([
    wildlifeModel.countThisMonth(null),
    feedbackModel.getAverageRatingThisMonth(null),
    alertModel.countActive(null),
    parkModel.getTotalVisitorsThisMonth(null)
  ]);

  return renderLayout(res, 'analyst/dashboard', {
    title: 'Analyst Dashboard',
    totalSightingsThisMonth,
    averageFeedbackRating,
    activeAlerts,
    totalVisitorsThisMonth,
    quickLinks: [
      { label: 'Analytics', href: '/analytics' },
      { label: 'Wildlife', href: '/wildlife' },
      { label: 'Environment', href: '/environment' },
      { label: 'Infrastructure', href: '/infrastructure' },
      { label: 'Feedback', href: '/feedback/manage' },
      { label: 'Alerts', href: '/alerts' }
    ],
    pageScripts: ['/js/analytics.js'],
    includeChartJs: true,
    errors: options.errors || [],
    formData: options.formData || {}
  });
}

exports.renderDashboard = async (req, res, next) => {
  try {
    return await renderDashboardPage(req, res);
  } catch (error) {
    return next(error);
  }
};

exports.renderUsers = async (req, res, next) => {
  try {
    return await renderUsersPage(req, res);
  } catch (error) {
    return next(error);
  }
};

exports.updateUserRole = async (req, res, next) => {
  try {
    const errors = mapErrors(req);
    const formData = { role: clean(req.body.role), userId: req.params.id };

    if (errors.length) {
      return await renderUsersPage(req, res, { status: 422, errors, formData });
    }

    const updatedUser = await userModel.updateRole(Number(req.params.id), formData.role);
    await logActivity(req.session.user.id, 'user_role_changed', 'admin', `Changed role for ${updatedUser.email} to ${formData.role}.`, req);
    return res.redirect('/admin/users');
  } catch (error) {
    return next(error);
  }
};

exports.toggleUser = async (req, res, next) => {
  try {
    const errors = mapErrors(req);
    if (errors.length) {
      return await renderUsersPage(req, res, { status: 422, errors, formData: { userId: req.params.id } });
    }

    const updatedUser = await userModel.toggleActive(Number(req.params.id));
    await logActivity(req.session.user.id, 'user_toggled', 'admin', `Toggled active state for ${updatedUser.email}.`, req);
    return res.redirect('/admin/users');
  } catch (error) {
    return next(error);
  }
};

exports.assignUserPark = async (req, res, next) => {
  try {
    const errors = mapErrors(req);
    const formData = { parkId: clean(req.body.parkId), userId: req.params.id };

    if (errors.length) {
      return await renderUsersPage(req, res, { status: 422, errors, formData });
    }

    await userModel.assignPark(Number(req.params.id), Number(formData.parkId));
    await logActivity(req.session.user.id, 'user_park_assigned', 'admin', `Assigned park #${formData.parkId} to user #${req.params.id}.`, req);
    return res.redirect('/admin/users');
  } catch (error) {
    return next(error);
  }
};

exports.renderParks = async (req, res, next) => {
  try {
    return await renderParksPage(req, res);
  } catch (error) {
    return next(error);
  }
};

exports.createPark = async (req, res, next) => {
  try {
    const formData = {
      name: clean(req.body.name),
      location: clean(req.body.location),
      region: clean(req.body.region),
      sizeHectares: clean(req.body.sizeHectares),
      capacity: clean(req.body.capacity),
      status: clean(req.body.status)
    };
    const errors = mapErrors(req);

    if (errors.length) {
      return await renderParksPage(req, res, { status: 422, errors, formData });
    }

    const parkId = await parkModel.createPark(formData);
    await logActivity(req.session.user.id, 'park_created', 'admin', `Created park #${parkId} (${formData.name}).`, req);
    return res.redirect('/admin/parks');
  } catch (error) {
    return next(error);
  }
};

exports.updateVisitorCount = async (req, res, next) => {
  try {
    const formData = {
      parkId: Number(req.params.id),
      visitors: clean(req.body.visitors),
      logDate: clean(req.body.logDate)
    };
    const errors = mapErrors(req);

    if (req.session.user.role === 'tourism_officer') {
      const hasAccess = await parkModel.hasAccess(req.session.user.id, req.session.user.role, formData.parkId);
      if (!hasAccess) {
        errors.push({ field: 'parkId', msg: 'You are not assigned to this park.' });
      }
    }

    if (errors.length) {
      return await renderDashboardPage(req, res, { status: 422, errors, formData });
    }

    await parkModel.updateVisitorCount({
      parkId: formData.parkId,
      visitors: Number(formData.visitors),
      loggedBy: req.session.user.id,
      logDate: formData.logDate || new Date().toISOString().slice(0, 10)
    });

    await logActivity(req.session.user.id, 'visitor_stats_updated', 'parks', `Updated visitor count for park #${formData.parkId} to ${formData.visitors}.`, req);
    return res.redirect('/dashboard');
  } catch (error) {
    return next(error);
  }
};

exports.renderLogs = async (req, res, next) => {
  try {
    return await renderLogsPage(req, res);
  } catch (error) {
    return next(error);
  }
};

exports.exportLogsCsv = async (req, res, next) => {
  try {
    const filters = {
      user: clean(req.query.user),
      module: clean(req.query.module),
      from: clean(req.query.from),
      to: clean(req.query.to)
    };

    const { rows } = await activityLogModel.list({ page: 1, limit: 5000, ...filters });
    const header = ['Timestamp', 'User', 'Email', 'Action', 'Module', 'Description', 'IP'];
    const lines = rows.map((row) => [
      row.created_at,
      row.user_name,
      row.user_email || '',
      row.action,
      row.module,
      row.description,
      row.ip_address || ''
    ].map(escapeCsv).join(','));

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="activity-logs.csv"');
    return res.send([header.map(escapeCsv).join(','), ...lines].join('\n'));
  } catch (error) {
    return next(error);
  }
};
