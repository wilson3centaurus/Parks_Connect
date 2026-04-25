const { validationResult } = require('express-validator');

const environmentModel = require('../models/environmentModel');
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
    title: options.title || 'Environment',
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
  return renderLayout(res, 'environment/reading-form', {
    title: 'Record Environmental Reading',
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
      readingType: clean(req.query.readingType),
      status: clean(req.query.status)
    };
    const parkIds = await parkModel.getAccessibleParkIds(req.session.user.id, req.session.user.role);
    const parks = await parkModel.getAccessibleParks(req.session.user.id, req.session.user.role);
    const { rows, total } = await environmentModel.listReadings({
      page,
      limit,
      parkId: filters.parkId,
      readingType: filters.readingType,
      status: filters.status,
      parkIds
    });

    return renderLayout(res, 'environment/index', {
      title: 'Environmental Readings',
      readings: rows,
      parks,
      filters,
      pagination: buildPagination('/environment', filters, page, limit, total)
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
      readingType: clean(req.body.readingType),
      value: clean(req.body.value),
      unit: clean(req.body.unit),
      readingDate: clean(req.body.readingDate),
      status: clean(req.body.status)
    };
    const errors = mapErrors(req);
    const hasAccess = await parkModel.hasAccess(req.session.user.id, req.session.user.role, Number(formData.parkId));

    if (!hasAccess) {
      errors.push({ field: 'parkId', msg: 'You are not allowed to submit data for this park.' });
    }

    if (errors.length) {
      return await renderForm(req, res, { status: 422, errors, formData });
    }

    await environmentModel.createReading({
      parkId: Number(formData.parkId),
      readingType: formData.readingType,
      value: Number(formData.value),
      unit: formData.unit,
      recordedBy: req.session.user.id,
      readingDate: formData.readingDate,
      status: formData.status
    });

    await logActivity(req.session.user.id, 'environmental_reading_created', 'environment', `Recorded ${formData.readingType} reading for park #${formData.parkId}.`, req);
    return res.redirect('/environment');
  } catch (error) {
    return next(error);
  }
};
