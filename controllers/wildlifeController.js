const fs = require('fs');
const path = require('path');
const { validationResult } = require('express-validator');

const wildlifeModel = require('../models/wildlifeModel');
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
    title: options.title || 'Wildlife',
    view,
    pageScripts: options.pageScripts || [],
    includeChartJs: false,
    errors: options.errors || [],
    formData: options.formData || {},
    ...options
  });
}

function removeUploadedFile(file) {
  if (file?.path && fs.existsSync(file.path)) {
    fs.unlinkSync(file.path);
  }
}

async function renderForm(req, res, options = {}) {
  const parks = await parkModel.getAccessibleParks(req.session.user.id, req.session.user.role);
  return renderLayout(res, 'wildlife/sighting-form', {
    title: 'Record Wildlife Sighting',
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
      species: clean(req.query.species)
    };
    const parkIds = await parkModel.getAccessibleParkIds(req.session.user.id, req.session.user.role);
    const parks = await parkModel.getAccessibleParks(req.session.user.id, req.session.user.role);
    const selectedParkAllowed = !filters.parkId || await parkModel.hasAccess(req.session.user.id, req.session.user.role, Number(filters.parkId));
    const { rows, total } = await wildlifeModel.listSightings({
      page,
      limit,
      parkId: selectedParkAllowed ? filters.parkId : '',
      species: filters.species,
      parkIds
    });

    return renderLayout(res, 'wildlife/index', {
      title: 'Wildlife Sightings',
      sightings: rows,
      parks,
      filters,
      pagination: buildPagination('/wildlife', filters, page, limit, total)
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
      speciesName: clean(req.body.speciesName),
      commonName: clean(req.body.commonName),
      category: clean(req.body.category),
      count: clean(req.body.count),
      latitude: clean(req.body.latitude),
      longitude: clean(req.body.longitude),
      sightingDate: clean(req.body.sightingDate),
      notes: clean(req.body.notes)
    };

    const errors = mapErrors(req);
    const hasAccess = await parkModel.hasAccess(req.session.user.id, req.session.user.role, Number(formData.parkId));
    if (!hasAccess) {
      errors.push({ field: 'parkId', msg: 'You are not allowed to submit data for this park.' });
    }

    if (errors.length) {
      removeUploadedFile(req.file);
      return await renderForm(req, res, { status: 422, errors, formData });
    }

    const photo = req.file ? path.posix.join('/uploads/wildlife', req.file.filename) : null;
    await wildlifeModel.createSighting({
      parkId: Number(formData.parkId),
      speciesName: formData.speciesName,
      commonName: formData.commonName,
      category: formData.category,
      count: Number(formData.count),
      latitude: formData.latitude || null,
      longitude: formData.longitude || null,
      recordedBy: req.session.user.id,
      sightingDate: formData.sightingDate,
      notes: formData.notes,
      photo
    });

    await logActivity(req.session.user.id, 'wildlife_sighting_created', 'wildlife', `Recorded a wildlife sighting for park #${formData.parkId}.`, req);
    return res.redirect('/wildlife');
  } catch (error) {
    removeUploadedFile(req.file);
    return next(error);
  }
};
