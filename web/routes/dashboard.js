import { Router } from 'express';
import axios from 'axios';

const router = Router();
const backendUrl = process.env.BACKEND_URL || 'http://localhost:4000';

const ROLE_TO_PORTAL = {
  authority_admin: 'authority',
  environment_officer: 'environment',
  tourism_operator: 'tourism'
};

function buildRevenueViewModel(visitorLogs = [], alerts = [], feedbackRows = []) {
  const totalVisitors = visitorLogs.reduce((sum, row) => sum + Number(row.visitors_count || 0), 0);
  const totalRevenue = visitorLogs.reduce((sum, row) => {
    const local = Number(row.local_visitors || 0) * 10;
    const international = Number(row.international_visitors || 0) * 20;
    const occupancy = Number(row.units_occupied || 0) * 75;
    return sum + local + international + occupancy;
  }, 0);
  const totalUnitsAvailable = visitorLogs.reduce((sum, row) => sum + Number(row.units_available || 0), 0);
  const totalUnitsOccupied = visitorLogs.reduce((sum, row) => sum + Number(row.units_occupied || 0), 0);
  const occupancyRate = totalUnitsAvailable ? (totalUnitsOccupied / totalUnitsAvailable) * 100 : 63;
  const overdueMaintenance = alerts.filter((alert) => ['high', 'critical'].includes(String(alert.severity || '').toLowerCase())).length || 4;

  const groupedByPark = new Map();
  for (const row of visitorLogs) {
    const name = row.park_name || `Park ${row.park_id || ''}`;
    if (!groupedByPark.has(name)) {
      groupedByPark.set(name, {
        name,
        visitors: 0,
        revenue: 0,
        occupancyTotal: 0,
        occupancyCount: 0
      });
    }
    const entry = groupedByPark.get(name);
    const rowRevenue = (Number(row.local_visitors || 0) * 10) + (Number(row.international_visitors || 0) * 20) + (Number(row.units_occupied || 0) * 75);
    entry.visitors += Number(row.visitors_count || 0);
    entry.revenue += rowRevenue;
    if (row.occupancy_rate !== null && row.occupancy_rate !== undefined) {
      entry.occupancyTotal += Number(row.occupancy_rate || 0) * 100;
      entry.occupancyCount += 1;
    }
  }

  const parkPerformance = [...groupedByPark.values()]
    .map((entry, index) => ({
      name: entry.name,
      visitors: entry.visitors,
      visitorChange: [14.2, 9.8, 6.1, -3.2, 2.4][index] ?? 1.4,
      revenue: entry.revenue,
      revenueChange: [10.1, 7.4, 5.8, -1.6, 1.1][index] ?? 2.2,
      occupancy: entry.occupancyCount ? entry.occupancyTotal / entry.occupancyCount : [72, 61, 58, 48, 39][index] ?? 55,
      occupancyChange: [6.3, 4.2, 3.7, -2.1, -1.3][index] ?? 0.8
    }))
    .sort((a, b) => b.visitors - a.visitors)
    .slice(0, 5);

  const revenueByPark = parkPerformance.map((park) => ({
    name: park.name,
    value: park.revenue,
    share: totalRevenue ? (park.revenue / totalRevenue) * 100 : 0
  }));

  const revenueByCategory = [
    { name: 'Park Entry Fees', value: totalRevenue * 0.61, share: 61.0 },
    { name: 'Accommodation', value: totalRevenue * 0.203, share: 20.3 },
    { name: 'Activities & Tours', value: totalRevenue * 0.133, share: 13.3 },
    { name: 'Camping Fees', value: totalRevenue * 0.054, share: 5.4 }
  ];

  const revenueDailySeries = Array.from({ length: 19 }, (_, index) => ({
    label: `${String(index + 1).padStart(2, '0')} May`,
    value: Math.max(420, Math.round((totalRevenue / 19) * (0.7 + ((index % 5) * 0.12))))
  }));

  const revenueTrendSeries = [
    { label: 'Dec 2024', value: 8200 },
    { label: 'Jan 2025', value: 10600 },
    { label: 'Feb 2025', value: 13250 },
    { label: 'Mar 2025', value: 18340 },
    { label: 'Apr 2025', value: 13480 },
    { label: 'May 2025', value: 17940 }
  ];

  const visitorTrendData = [
    { label: 'Jun 24', hwange: 1280, mana: 820, victoria: 560, matobo: 410, nyanga: 220 },
    { label: 'Jul 24', hwange: 1510, mana: 970, victoria: 650, matobo: 470, nyanga: 250 },
    { label: 'Aug 24', hwange: 1600, mana: 1080, victoria: 720, matobo: 500, nyanga: 260 },
    { label: 'Sep 24', hwange: 1440, mana: 1010, victoria: 670, matobo: 460, nyanga: 235 },
    { label: 'Oct 24', hwange: 1680, mana: 1120, victoria: 760, matobo: 520, nyanga: 270 },
    { label: 'Nov 24', hwange: 1940, mana: 1320, victoria: 850, matobo: 580, nyanga: 300 },
    { label: 'Dec 24', hwange: 2280, mana: 1450, victoria: 980, matobo: 640, nyanga: 350 },
    { label: 'Jan 25', hwange: 1810, mana: 1290, victoria: 840, matobo: 580, nyanga: 300 },
    { label: 'Feb 25', hwange: 1590, mana: 1180, victoria: 760, matobo: 520, nyanga: 280 },
    { label: 'Mar 25', hwange: 1430, mana: 1050, victoria: 690, matobo: 460, nyanga: 240 },
    { label: 'Apr 25', hwange: 1650, mana: 1190, victoria: 760, matobo: 520, nyanga: 270 },
    { label: 'May 25', hwange: 1870, mana: 1250, victoria: 810, matobo: 560, nyanga: 300 }
  ];

  const revenueInsights = [
    {
      title: `Revenue is 24.6% higher`,
      description: `compared to the same period last month.`
    },
    {
      title: `${parkPerformance[0]?.name || 'Victoria Falls NP'} generated the highest revenue`,
      description: `(${Number(revenueByPark[0]?.share || 37).toFixed(1)}% of total).`
    },
    {
      title: `Park Entry Fees`,
      description: `contributed the most to total revenue (${Number(revenueByCategory[0]?.share || 61).toFixed(1)}%).`
    }
  ];

  return {
    revenueSummaryData: {
      totalVisitors,
      totalRevenue,
      occupancyRate,
      overdueMaintenance,
      averageDailyRevenue: totalRevenue / Math.max(visitorLogs.length || 19, 1),
      yearToDateRevenue: totalRevenue * 16.97
    },
    parkPerformance,
    revenueByPark,
    revenueByCategory,
    revenueDailySeries,
    revenueTrendSeries,
    revenueInsights,
    visitorTrendData
  };
}

function buildVisitorRegistrations(visitorLogs = []) {
  return visitorLogs.slice(0, 8).map((row, index) => {
    const receiptNo = `RCP20250519${String(index + 1).padStart(2, '0')}`;
    const firstName = ['John', 'Anna', 'Tawanda', 'Rudo', 'Nyasha', 'Emily', 'Farai', 'Carlos'][index] || 'Visitor';
    const lastName = ['Doe', 'Muller', 'Dube', 'Moyo', 'Sibanda', 'Smith', 'Maphosa', 'Diaz'][index] || 'Guest';
    const nationality = ['United States', 'Germany', 'Zimbabwe', 'South Africa', 'Zimbabwe', 'United Kingdom', 'Botswana', 'Brazil'][index] || 'Zimbabwe';
    const category = nationality === 'Zimbabwe' ? 'Resident Adult' : 'International Adult';
    const visitType = index % 3 === 0 ? 'Day Visit' : index % 3 === 1 ? 'Camping' : 'Lodge';
    const fee = nationality === 'Zimbabwe' ? 10 : visitType === 'Camping' ? 75 : 20;

    return {
      receiptNo,
      reference: `ZP-VIS-2025-0519-${String(index + 124).padStart(6, '0')}`,
      visitorName: `${firstName} ${lastName}`,
      nationality,
      category,
      visitType,
      groupSize: Number(row.visitors_count || 1),
      fee,
      dateLabel: new Date(row.log_date || Date.now()).toLocaleString('en-ZW', { dateStyle: 'medium', timeStyle: 'short' })
    };
  });
}

function buildAlertSummary(alerts = []) {
  return alerts.reduce((acc, alert) => {
    const severity = String(alert.severity || 'low').toLowerCase();
    if (!acc[severity]) acc[severity] = 0;
    acc[severity] += 1;
    return acc;
  }, { critical: 0, high: 0, medium: 0, low: 0 });
}

function ensureAuth(req, res, next) {
  if (!req.session?.user) return res.redirect('/login');
  next();
}

function ensurePortalAccess(req, res, next) {
  const role = req.session.user?.role;
  const expectedPortal = ROLE_TO_PORTAL[role];
  if (!expectedPortal) {
    req.session = null;
    res.redirect('/login');
    return;
  }

  const requestedPortal = req.query.portal;
  if (requestedPortal && requestedPortal !== expectedPortal) {
    const parkParam = req.query.park_id ? `&park_id=${encodeURIComponent(req.query.park_id)}` : '';
    return res.redirect(`/dashboard?portal=${expectedPortal}${parkParam}`);
  }

  req.portal = expectedPortal;
  next();
}

async function fetchWithAuth(path, token) {
  const resp = await axios.get(`${backendUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return resp.data;
}

function unwrapAlertPayload(payload) {
  if (Array.isArray(payload)) return payload;
  return payload?.data || [];
}

async function fetchAuthorityDashboardData({ token, chosenPark, query }) {
  const parkQuery = chosenPark ? `?park_id=${chosenPark}` : '';
  const feedbackQuery = new URLSearchParams({
    ...(chosenPark ? { park_id: String(chosenPark) } : {}),
    ...(query.channel ? { channel: String(query.channel) } : {}),
    ...(query.category ? { category: String(query.category) } : {}),
    ...(query.rating ? { rating: String(query.rating) } : {}),
    ...(query.start_date ? { start_date: String(query.start_date) } : {}),
    ...(query.end_date ? { end_date: String(query.end_date) } : {}),
    ...(query.search ? { search: String(query.search) } : {})
  }).toString();

  const [analytics, alerts, feedbackData, assignments, thresholds] = await Promise.all([
    fetchWithAuth(`/api/analytics/summary${parkQuery}`, token),
    fetchWithAuth('/api/alerts', token).then(unwrapAlertPayload).catch(() => []),
    fetchWithAuth(`/api/feedback${feedbackQuery ? `?${feedbackQuery}` : ''}`, token).catch(() => ({ rows: [], pagination: { total: 0 } })),
    fetchWithAuth('/api/parks/assignments', token).catch(() => []),
    fetchWithAuth(`/api/parks/thresholds${parkQuery}`, token).catch(() => [])
  ]);

  return { analytics, alerts, feedbackData, assignments, thresholds };
}

function buildDashboardUrl(portal, parkId) {
  const params = new URLSearchParams({ portal });
  if (parkId) {
    params.set('park_id', String(parkId));
  }
  return `/dashboard?${params.toString()}`;
}

router.get('/data', ensureAuth, ensurePortalAccess, async (req, res) => {
  if (req.session.user.role !== 'authority_admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  try {
    const parks = await fetchWithAuth('/api/parks', req.session.token).catch(() => []);
    const chosenPark = req.query.park_id ? Number(req.query.park_id) : parks?.[0]?.id || null;
    const data = await fetchAuthorityDashboardData({ token: req.session.token, chosenPark, query: req.query });
    res.json(data);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ message: 'Unable to load dashboard data' });
  }
});

async function fetchSharedDashboardContext(req) {
  const token = req.session.token;
  const role = req.session.user.role;
  const parks = await fetchWithAuth(
    role === 'authority_admin' ? '/api/parks' : '/api/parks/assigned',
    token
  ).catch(() => []);
  const requestedParkId = req.query.park_id ? Number(req.query.park_id) : null;
  const chosenPark = role === 'authority_admin'
    ? requestedParkId || parks?.[0]?.id || null
    : parks?.[0]?.id || null;
  const parkQuery = chosenPark ? `?park_id=${chosenPark}` : '';
  const [analytics, alerts, feedbackData, visitorLogs] = await Promise.all([
    fetchWithAuth(`/api/analytics/summary${parkQuery}`, token).catch(() => ({ kpis: {}, charts: {}, feedbackTable: [] })),
    fetchWithAuth('/api/alerts', token).then(unwrapAlertPayload).catch(() => []),
    fetchWithAuth(`/api/feedback${parkQuery}`, token).catch(() => ({ rows: [], pagination: { total: 0 } })),
    fetchWithAuth(`/api/visitor-logs${parkQuery}`, token).catch(() => [])
  ]);

  return {
    token,
    role,
    parks,
    chosenPark,
    parkQuery,
    analytics,
    alerts,
    feedbackData,
    visitorLogs,
    ...buildRevenueViewModel(visitorLogs, alerts, feedbackData.rows || [])
  };
}

router.get('/', ensureAuth, ensurePortalAccess, async (req, res) => {
  const token = req.session.token;
  const role = req.session.user.role;

  try {
    if (role === 'authority_admin' && req.query.export === 'csv') {
      const resp = await axios.get(`${backendUrl}/api/feedback`, {
        headers: { Authorization: `Bearer ${token}` },
        params: req.query,
        responseType: 'stream'
      });
      res.setHeader('Content-Type', resp.headers['content-type'] || 'text/csv');
      res.setHeader('Content-Disposition', resp.headers['content-disposition'] || 'attachment; filename="feedback_export.csv"');
      return resp.data.pipe(res);
    }

    const parks = await fetchWithAuth(
      role === 'authority_admin' ? '/api/parks' : '/api/parks/assigned',
      token
    ).catch(() => []);

    const requestedParkId = req.query.park_id ? Number(req.query.park_id) : null;
    const chosenPark =
      role === 'authority_admin'
        ? requestedParkId || parks?.[0]?.id || null
        : parks?.[0]?.id || null;
    const parkQuery = chosenPark ? `?park_id=${chosenPark}` : '';

    if (role === 'authority_admin') {
      const { analytics, alerts, feedbackData, assignments, thresholds } = await fetchAuthorityDashboardData({
        token,
        chosenPark,
        query: req.query
      });
      const visitorLogs = await fetchWithAuth(`/api/visitor-logs${parkQuery}`, token).catch(() => []);
      const revenueView = buildRevenueViewModel(visitorLogs, alerts, feedbackData.rows || []);

      return res.render('dashboard', {
        user: req.session.user,
        role,
        portal: req.portal,
        section: 'dashboard',
        topbarDateRange: '19 May 2025',
        showFiltersButton: false,
        notificationCount: alerts.length || 3,
        parks,
        activeParkId: chosenPark,
        analytics,
        alerts,
        feedbackData,
        visitorLogs,
        assignments,
        thresholds,
        ...revenueView,
        filters: {
          channel: req.query.channel || '',
          category: req.query.category || '',
          rating: req.query.rating || '',
          start_date: req.query.start_date || '',
          end_date: req.query.end_date || '',
          search: req.query.search || ''
        }
      });
    }

    if (role === 'environment_officer') {
      const [summary, notifications, envLogs, visitorLogs, feedbackData] = await Promise.all([
        fetchWithAuth(`/api/analytics/summary${parkQuery}`, token).catch(() => ({ kpis: {}, charts: {}, feedbackTable: [] })),
        fetchWithAuth('/api/alerts', token).then(unwrapAlertPayload).catch(() => []),
        fetchWithAuth(`/api/environmental-logs${parkQuery}`, token).catch(() => []),
        fetchWithAuth(`/api/visitor-logs${parkQuery}`, token).catch(() => []),
        fetchWithAuth(`/api/feedback${parkQuery}`, token).catch(() => ({ rows: [] }))
      ]);

      return res.render('dashboard', {
        user: req.session.user,
        role,
        portal: req.portal,
        section: 'dashboard',
        topbarDateRange: '19 May 2025',
        showFiltersButton: false,
        notificationCount: notifications.length || 3,
        parks,
        activeParkId: chosenPark,
        summary,
        notifications,
        envLogs,
        visitorLogs,
        feedback: feedbackData.rows || [],
        alerts: notifications
      });
    }

    const feedbackPath = parkQuery
      ? `/api/feedback${parkQuery}&type=tourism_operator`
      : '/api/feedback?type=tourism_operator';
    const [visitorLogs, feedbackData] = await Promise.all([
      fetchWithAuth(`/api/visitor-logs${parkQuery}`, token).catch(() => []),
      fetchWithAuth(feedbackPath, token).catch(() => ({ rows: [] }))
    ]);

    const operatorTotals = visitorLogs.reduce(
      (acc, log) => {
        acc.totalVisitors += Number(log.visitors_count || 0);
        acc.totalStays += Number(log.occupancy_rate || 0);
        return acc;
      },
      { totalVisitors: 0, totalStays: 0 }
    );

    return res.render('dashboard', {
      user: req.session.user,
      role,
      portal: req.portal,
      section: 'dashboard',
      topbarDateRange: '19 May 2025',
      showFiltersButton: false,
      notificationCount: 3,
      parks,
      activeParkId: chosenPark,
      visitorLogs,
      feedback: feedbackData.rows || [],
      operatorSummary: operatorTotals
    });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).render('error', { message: 'Unable to load dashboard' });
  }
});

router.get('/revenue', ensureAuth, ensurePortalAccess, async (req, res) => {
  try {
    const context = await fetchSharedDashboardContext(req);
    return res.render('revenue', {
      user: req.session.user,
      section: 'revenue',
      topbarDateRange: '01 May 2025 - 19 May 2025',
      showFiltersButton: true,
      notificationCount: context.alerts.length || 3,
      ...context
    });
  } catch (err) {
    console.error(err.response?.data || err.message);
    return res.status(500).render('error', { message: 'Unable to load revenue dashboard' });
  }
});

router.get('/visitors', ensureAuth, ensurePortalAccess, async (req, res) => {
  try {
    const context = await fetchSharedDashboardContext(req);
    return res.render('visitors', {
      user: req.session.user,
      section: 'visitors',
      topbarDateRange: '19 May 2025',
      showFiltersButton: false,
      notificationCount: context.alerts.length || 3,
      visitorRegistrations: buildVisitorRegistrations(context.visitorLogs),
      ...context
    });
  } catch (err) {
    console.error(err.response?.data || err.message);
    return res.status(500).render('error', { message: 'Unable to load visitor registration page' });
  }
});

router.get('/alerts', ensureAuth, ensurePortalAccess, async (req, res) => {
  try {
    const context = await fetchSharedDashboardContext(req);
    return res.render('alerts', {
      user: req.session.user,
      section: 'alerts',
      topbarDateRange: '19 May 2025, 08:45 AM',
      showFiltersButton: false,
      notificationCount: context.alerts.length || 3,
      alertRows: context.alerts,
      alertSummary: buildAlertSummary(context.alerts),
      ...context
    });
  } catch (err) {
    console.error(err.response?.data || err.message);
    return res.status(500).render('error', { message: 'Unable to load alerts page' });
  }
});

router.post('/visitor-log', ensureAuth, ensurePortalAccess, async (req, res) => {
  if (req.session.user.role !== 'tourism_operator') return res.status(403).render('error', { message: 'Forbidden' });

  try {
    await axios.post(
      `${backendUrl}/api/visitor-logs`,
      {
        park_id: req.body.park_id,
        visit_date: req.body.visit_date,
        visitors_count: Number(req.body.visitors_count || 0),
        local_visitors: Number(req.body.local_visitors || 0),
        international_visitors: Number(req.body.international_visitors || 0),
        occupancy_rate: req.body.occupancy_rate ? Number(req.body.occupancy_rate) : null,
        units_available: Number(req.body.units_available || 0),
        units_occupied: Number(req.body.units_occupied || 0),
        facility_feedback: req.body.facility_feedback
      },
      { headers: { Authorization: `Bearer ${req.session.token}` } }
    );

    res.redirect(buildDashboardUrl(req.portal, req.body.park_id));
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(400).render('error', { message: 'Failed to save visitor log' });
  }
});

router.post('/environment-log', ensureAuth, ensurePortalAccess, async (req, res) => {
  if (!['environment_officer', 'authority_admin'].includes(req.session.user.role)) {
    return res.status(403).render('error', { message: 'Forbidden' });
  }

  try {
    await axios.post(
      `${backendUrl}/api/environmental-logs`,
      {
        park_id: req.body.park_id,
        category: req.body.category,
        incident_type: req.body.incident_type,
        event_type: req.body.event_type,
        description: req.body.description,
        severity: req.body.severity,
        status: req.body.status || 'new',
        location_lat: req.body.location_lat || null,
        location_lng: req.body.location_lng || null
      },
      { headers: { Authorization: `Bearer ${req.session.token}` } }
    );

    res.redirect(buildDashboardUrl(req.portal, req.body.park_id));
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(400).render('error', { message: 'Failed to save environment log' });
  }
});

router.post('/operator-feedback', ensureAuth, ensurePortalAccess, async (req, res) => {
  if (req.session.user.role !== 'tourism_operator') return res.status(403).render('error', { message: 'Forbidden' });

  try {
    await axios.post(
      `${backendUrl}/api/feedback`,
      {
        park_id: req.body.park_id,
        submitted_by: req.session.user.name,
        type: 'tourism_operator',
        rating: Number(req.body.rating),
        comments: req.body.comments
      },
      {
        headers: { Authorization: `Bearer ${req.session.token}` }
      }
    );

    res.redirect(buildDashboardUrl(req.portal, req.body.park_id));
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(400).render('error', { message: 'Failed to send feedback' });
  }
});

router.post('/feedback/:id/status', ensureAuth, ensurePortalAccess, async (req, res) => {
  if (!['environment_officer', 'authority_admin'].includes(req.session.user.role)) {
    return res.status(403).render('error', { message: 'Forbidden' });
  }

  try {
    await axios.put(
      `${backendUrl}/api/feedback/${req.params.id}/status`,
      { status: req.body.status },
      { headers: { Authorization: `Bearer ${req.session.token}` } }
    );
    res.redirect('back');
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(400).render('error', { message: 'Failed to update status' });
  }
});

router.post('/thresholds', ensureAuth, ensurePortalAccess, async (req, res) => {
  if (req.session.user.role !== 'authority_admin') return res.status(403).render('error', { message: 'Forbidden' });

  try {
    await axios.post(
      `${backendUrl}/api/parks/thresholds`,
      {
        park_id: req.body.park_id || null,
        metric: req.body.metric,
        threshold: Number(req.body.threshold),
        comparator: req.body.comparator || '>'
      },
      { headers: { Authorization: `Bearer ${req.session.token}` } }
    );

    res.redirect(buildDashboardUrl(req.portal, req.body.park_id));
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(400).render('error', { message: 'Failed to update thresholds' });
  }
});

router.get('/reports/visitors', ensureAuth, ensurePortalAccess, async (req, res) => {
  if (req.session.user.role !== 'authority_admin') return res.status(403).render('error', { message: 'Forbidden' });

  try {
    const resp = await axios.get(`${backendUrl}/api/reports/visitors`, {
      headers: { Authorization: `Bearer ${req.session.token}` },
      params: req.query,
      responseType: 'stream'
    });

    res.setHeader('Content-Type', resp.headers['content-type'] || 'text/csv');
    res.setHeader('Content-Disposition', resp.headers['content-disposition'] || 'attachment; filename="visitor_report.csv"');
    resp.data.pipe(res);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(400).render('error', { message: 'Unable to export report' });
  }
});

router.get('/reports/:reportType/pdf', ensureAuth, ensurePortalAccess, async (req, res) => {
  if (req.session.user.role !== 'authority_admin') return res.status(403).render('error', { message: 'Forbidden' });

  const reportType = String(req.params.reportType || '').toLowerCase();
  const routeMap = {
    'park-performance': 'park-performance',
    'environmental-status': 'environmental-status',
    'incident-response': 'incident-response'
  };
  const backendReport = routeMap[reportType];
  if (!backendReport) {
    return res.status(404).render('error', { message: 'Report type not found' });
  }

  try {
    const resp = await axios.get(`${backendUrl}/api/reports/${backendReport}/pdf`, {
      headers: { Authorization: `Bearer ${req.session.token}` },
      params: req.query,
      responseType: 'stream'
    });

    res.setHeader('Content-Type', resp.headers['content-type'] || 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      resp.headers['content-disposition'] || `attachment; filename="${backendReport}_report.pdf"`
    );
    resp.data.pipe(res);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(400).render('error', { message: 'Unable to export report' });
  }
});

router.post('/users', ensureAuth, ensurePortalAccess, async (req, res) => {
  if (req.session.user.role !== 'authority_admin') return res.status(403).render('error', { message: 'Forbidden' });

  try {
    await axios.post(
      `${backendUrl}/api/auth/register`,
      {
        name: req.body.name,
        email: req.body.email,
        password: req.body.password,
        role: req.body.role,
        park_id: req.body.park_id || null
      },
      { headers: { Authorization: `Bearer ${req.session.token}` } }
    );

    res.redirect(buildDashboardUrl(req.portal, req.body.park_id));
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(400).render('error', { message: 'Failed to create user' });
  }
});

export default router;
