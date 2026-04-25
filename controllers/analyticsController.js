const wildlifeModel = require('../models/wildlifeModel');
const environmentModel = require('../models/environmentModel');
const feedbackModel = require('../models/feedbackModel');
const alertModel = require('../models/alertModel');
const infrastructureModel = require('../models/infrastructureModel');
const parkModel = require('../models/parkModel');

function renderLayout(res, view, options = {}) {
  return res.status(options.status || 200).render('layout', {
    title: options.title || 'Analytics',
    view,
    pageScripts: options.pageScripts || ['/js/analytics.js'],
    includeChartJs: true,
    errors: options.errors || [],
    formData: options.formData || {},
    ...options
  });
}

function escapeCsv(value) {
  const normalized = value === null || value === undefined ? '' : String(value);
  return `"${normalized.replace(/"/g, '""')}"`;
}

async function getScope(req) {
  return parkModel.getAccessibleParkIds(req.session.user.id, req.session.user.role);
}

async function getSummaryStats(req) {
  const parkIds = await getScope(req);
  const [totalSightingsThisMonth, averageFeedbackRating, activeAlerts, totalVisitorsThisMonth] = await Promise.all([
    wildlifeModel.countThisMonth(parkIds),
    feedbackModel.getAverageRatingThisMonth(parkIds),
    alertModel.countActive(parkIds),
    parkModel.getTotalVisitorsThisMonth(parkIds)
  ]);

  return {
    totalSightingsThisMonth,
    averageFeedbackRating,
    activeAlerts,
    totalVisitorsThisMonth
  };
}

exports.renderAnalyticsPage = async (req, res, next) => {
  try {
    const summary = await getSummaryStats(req);
    return renderLayout(res, 'analytics/index', {
      title: 'Analytics',
      ...summary
    });
  } catch (error) {
    return next(error);
  }
};

exports.getWildlifeBySpecies = async (req, res, next) => {
  try {
    const data = await wildlifeModel.getTopSpecies(await getScope(req), 10);
    return res.json({ success: true, data, message: '' });
  } catch (error) {
    return next(error);
  }
};

exports.getReadingsOverTime = async (req, res, next) => {
  try {
    const data = await environmentModel.getReadingsOverTime(await getScope(req));
    return res.json({ success: true, data, message: '' });
  } catch (error) {
    return next(error);
  }
};

exports.getFeedbackRatings = async (req, res, next) => {
  try {
    const data = await feedbackModel.getRatingsDistribution(await getScope(req));
    return res.json({ success: true, data, message: '' });
  } catch (error) {
    return next(error);
  }
};

exports.getAlertsByType = async (req, res, next) => {
  try {
    const data = await alertModel.getAlertsByTypeAndSeverity(await getScope(req));
    return res.json({ success: true, data, message: '' });
  } catch (error) {
    return next(error);
  }
};

exports.getVisitorTrends = async (req, res, next) => {
  try {
    const data = await parkModel.getVisitorTrendsLast30Days(await getScope(req));
    return res.json({ success: true, data, message: '' });
  } catch (error) {
    return next(error);
  }
};

exports.getInfrastructureStatus = async (req, res, next) => {
  try {
    const data = await infrastructureModel.getStatusBreakdown(await getScope(req));
    return res.json({ success: true, data, message: '' });
  } catch (error) {
    return next(error);
  }
};

exports.exportDataset = async (req, res, next) => {
  try {
    const dataset = String(req.query.dataset || 'wildlife').trim();
    const parkIds = await getScope(req);
    let header = [];
    let rows = [];

    switch (dataset) {
      case 'environment':
        header = ['Date', 'Reading Type', 'Average Value'];
        rows = await environmentModel.getReadingsOverTime(parkIds);
        rows = rows.map((row) => [row.label, row.reading_type, row.average_value]);
        break;
      case 'feedback':
        header = ['Rating', 'Total'];
        rows = await feedbackModel.getRatingsDistribution(parkIds);
        rows = rows.map((row) => [row.rating, row.total]);
        break;
      case 'alerts':
        header = ['Type', 'Severity', 'Total'];
        rows = await alertModel.getAlertsByTypeAndSeverity(parkIds);
        rows = rows.map((row) => [row.type, row.severity, row.total]);
        break;
      case 'visitors':
        header = ['Date', 'Park', 'Visitors'];
        rows = await parkModel.getVisitorTrendsLast30Days(parkIds);
        rows = rows.map((row) => [row.label, row.park_name, row.total_visitors]);
        break;
      case 'infrastructure':
        header = ['Status', 'Total'];
        rows = await infrastructureModel.getStatusBreakdown(parkIds);
        rows = rows.map((row) => [row.status, row.total]);
        break;
      case 'wildlife':
      default:
        header = ['Species', 'Total Count'];
        rows = await wildlifeModel.getTopSpecies(parkIds, 10);
        rows = rows.map((row) => [row.species_name, row.total_count]);
        break;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${dataset}-analytics.csv"`);
    return res.send([
      header.map(escapeCsv).join(','),
      ...rows.map((row) => row.map(escapeCsv).join(','))
    ].join('\n'));
  } catch (error) {
    return next(error);
  }
};
