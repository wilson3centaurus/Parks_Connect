const { validationResult } = require('express-validator');

const infrastructureModel = require('../models/infrastructureModel');
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
    title: options.title || 'Infrastructure',
    view,
    pageScripts: [],
    includeChartJs: false,
    errors: options.errors || [],
    formData: options.formData || {},
    ...options
  });
}

async function renderForm(req, res, options = {}) {
  const parks = await parkModel.getAccessibleParks(req.session.user.id, req.session.user.role);
  return renderLayout(res, 'infrastructure/report-form', {
    title: 'Report Infrastructure Status',
    parks,
    errors: options.errors || [],
    formData: options.formData || {},
    status: options.status || 200
  });
}

exports.renderIndex = async (req, res, next) => {
  try {
    const { page, limit } = parsePagination(req.query);
    const filters = {
      parkId: clean(req.query.parkId),
      status: clean(req.query.status),
      type: clean(req.query.type)
    };
    const parkIds = await parkModel.getAccessibleParkIds(req.session.user.id, req.session.user.role);
    const parks = await parkModel.getAccessibleParks(req.session.user.id, req.session.user.role);
    const { rows, total } = await infrastructureModel.listReports({
      page,
      limit,
      parkId: filters.parkId,
      status: filters.status,
      type: filters.type,
      parkIds
    });

    return renderLayout(res, 'infrastructure/index', {
      title: 'Infrastructure Reports',
      reports: rows,
      parks,
      filters,
      pagination: buildPagination('/infrastructure', filters, page, limit, total)
    });
  } catch (error) {
    return next(error);
  }
};

exports.renderForm = async (req, res, next) => {
  try {
    return await renderForm(req, res);
  } catch (error) {
    return next(error);
  }
};

exports.create = async (req, res, next) => {
  try {
    const formData = {
      parkId: clean(req.body.parkId),
      name: clean(req.body.name),
      type: clean(req.body.type),
      status: clean(req.body.status),
      lastInspected: clean(req.body.lastInspected),
      notes: clean(req.body.notes)
    };
    const errors = mapErrors(req);
    const hasAccess = await parkModel.hasAccess(req.session.user.id, req.session.user.role, Number(formData.parkId));

    if (!hasAccess) {
      errors.push({ field: 'parkId', msg: 'You are not allowed to submit data for this park.' });
    }

    if (errors.length) {
      return await renderForm(req, res, { status: 422, errors, formData });
    }

    await infrastructureModel.createReport({
      parkId: Number(formData.parkId),
      name: formData.name,
      type: formData.type,
      status: formData.status,
      lastInspected: formData.lastInspected || null,
      reportedBy: req.session.user.id,
      notes: formData.notes
    });

    await logActivity(req.session.user.id, 'infrastructure_reported', 'infrastructure', `Reported ${formData.type} status for park #${formData.parkId}.`, req);
    return res.redirect('/infrastructure');
  } catch (error) {
    return next(error);
  }
};
