const { validationResult } = require('express-validator');

const feedbackModel = require('../models/feedbackModel');
const parkModel = require('../models/parkModel');
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
    title: options.title || 'Feedback',
    view,
    pageScripts: [],
    includeChartJs: false,
    errors: options.errors || [],
    formData: options.formData || {},
    ...options
  });
}

async function getPublicParks() {
  const { rows } = await parkModel.listParks({ page: 1, limit: 500, search: '', status: '' });
  return rows;
}

function renderSubmit(res, options = {}) {
  return res.status(options.status || 200).render('feedback/submit', {
    title: 'Submit Feedback',
    errors: options.errors || [],
    formData: options.formData || {},
    parks: options.parks || [],
    successMessage: options.successMessage || ''
  });
}

async function renderManagePage(req, res, options = {}) {
  const { page, limit } = parsePagination(req.query);
  const parkIds = await parkModel.getAccessibleParkIds(req.session.user.id, req.session.user.role);
  const parks = req.session.user.role === 'admin' || req.session.user.role === 'analyst'
    ? await getPublicParks()
    : await parkModel.getAccessibleParks(req.session.user.id, req.session.user.role);
  const filters = {
    parkId: clean(req.query.parkId),
    status: clean(req.query.status),
    category: clean(req.query.category)
  };
  const { rows, total } = await feedbackModel.listFeedback({
    page,
    limit,
    parkId: filters.parkId,
    status: filters.status,
    category: filters.category,
    parkIds
  });

  return renderLayout(res, 'feedback/manage', {
    title: 'Manage Feedback',
    feedback: rows,
    parks,
    filters,
    pagination: buildPagination('/feedback/manage', filters, page, limit, total),
    errors: options.errors || [],
    formData: options.formData || {},
    status: options.status || 200
  });
}

exports.renderSubmit = async (_req, res, next) => {
  try {
    const parks = await getPublicParks();
    return renderSubmit(res, { parks });
  } catch (error) {
    return next(error);
  }
};

exports.submit = async (req, res, next) => {
  try {
    const parks = await getPublicParks();
    const formData = {
      parkId: clean(req.body.parkId),
      visitorName: clean(req.body.visitorName),
      visitorEmail: clean(req.body.visitorEmail).toLowerCase(),
      visitorPhone: clean(req.body.visitorPhone),
      channel: clean(req.body.channel),
      rating: clean(req.body.rating),
      category: clean(req.body.category),
      message: clean(req.body.message)
    };
    const errors = mapErrors(req);

    if (errors.length) {
      return renderSubmit(res, { status: 422, errors, formData, parks });
    }

    await feedbackModel.createFeedback({
      parkId: Number(formData.parkId),
      visitorName: formData.visitorName,
      visitorEmail: formData.visitorEmail,
      visitorPhone: formData.visitorPhone,
      channel: formData.channel,
      rating: Number(formData.rating),
      category: formData.category,
      message: formData.message
    });

    await logActivity(null, 'feedback_submitted', 'feedback', `Feedback submitted for park #${formData.parkId}.`, req);

    return renderSubmit(res, {
      parks,
      successMessage: 'Feedback submitted successfully. Thank you for your input.',
      formData: {}
    });
  } catch (error) {
    return next(error);
  }
};

exports.renderManage = async (req, res, next) => {
  try {
    return await renderManagePage(req, res);
  } catch (error) {
    return next(error);
  }
};

exports.updateStatus = async (req, res, next) => {
  try {
    const errors = mapErrors(req);
    const feedbackItem = await feedbackModel.getById(Number(req.params.id));

    if (!feedbackItem) {
      errors.push({ field: 'status', msg: 'Feedback item not found.' });
    } else if (req.session.user.role === 'tourism_officer') {
      const hasAccess = await parkModel.hasAccess(req.session.user.id, req.session.user.role, feedbackItem.park_id);
      if (!hasAccess) {
        errors.push({ field: 'status', msg: 'You are not allowed to update this feedback item.' });
      }
    }

    if (errors.length) {
      return await renderManagePage(req, res, { status: 422, errors, formData: { status: clean(req.body.status) } });
    }

    await feedbackModel.updateStatus(Number(req.params.id), clean(req.body.status));
    await logActivity(req.session.user.id, 'feedback_status_changed', 'feedback', `Updated feedback #${req.params.id} to ${clean(req.body.status)}.`, req);
    return res.redirect('/feedback/manage');
  } catch (error) {
    return next(error);
  }
};
