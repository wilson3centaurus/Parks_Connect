import { Router } from 'express';
import axios from 'axios';

const router = Router();
const backendUrl = process.env.BACKEND_URL || 'http://localhost:4000';

const ROLE_TO_PORTAL = {
  authority_admin: 'authority',
  environment_officer: 'environment',
  tourism_operator: 'tourism'
};

function ensureAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

function ensurePortalAccess(req, res, next) {
  const role = req.session.user?.role;
  const expectedPortal = ROLE_TO_PORTAL[role];
  if (!expectedPortal) {
    req.session.destroy(() => {
      res.redirect('/login');
    });
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

function buildDashboardUrl(portal, parkId) {
  const params = new URLSearchParams({ portal });
  if (parkId) {
    params.set('park_id', String(parkId));
  }
  return `/dashboard?${params.toString()}`;
}

router.get('/', ensureAuth, ensurePortalAccess, async (req, res) => {
  const token = req.session.token;
  const role = req.session.user.role;

  try {
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
      const [summary, notifications, feedback, visitorLogs, envLogs, assignments, thresholds] = await Promise.all([
        fetchWithAuth(`/api/analytics/summary${parkQuery}`, token),
        fetchWithAuth('/api/notifications?resolved=false', token),
        fetchWithAuth(`/api/feedback${parkQuery}`, token).catch(() => []),
        fetchWithAuth(`/api/visitor-logs${parkQuery}`, token).catch(() => []),
        fetchWithAuth(`/api/environmental-logs${parkQuery}`, token).catch(() => []),
        fetchWithAuth('/api/parks/assignments', token).catch(() => []),
        fetchWithAuth(`/api/parks/thresholds${parkQuery}`, token).catch(() => [])
      ]);

      return res.render('dashboard', {
        user: req.session.user,
        role,
        portal: req.portal,
        parks,
        activeParkId: chosenPark,
        summary,
        notifications,
        feedback,
        visitorLogs,
        envLogs,
        assignments,
        thresholds
      });
    }

    if (role === 'environment_officer') {
      const [summary, notifications, envLogs, visitorLogs, feedback] = await Promise.all([
        fetchWithAuth(`/api/analytics/summary${parkQuery}`, token).catch(() => ({ totals: {}, charts: {}, parks: {} })),
        fetchWithAuth('/api/notifications?resolved=false', token),
        fetchWithAuth(`/api/environmental-logs${parkQuery}`, token).catch(() => []),
        fetchWithAuth(`/api/visitor-logs${parkQuery}`, token).catch(() => []),
        fetchWithAuth(`/api/feedback${parkQuery}`, token).catch(() => [])
      ]);

      return res.render('dashboard', {
        user: req.session.user,
        role,
        portal: req.portal,
        parks,
        activeParkId: chosenPark,
        summary,
        notifications,
        envLogs,
        visitorLogs,
        feedback
      });
    }

    const feedbackPath = parkQuery
      ? `/api/feedback${parkQuery}&type=tourism_operator`
      : '/api/feedback?type=tourism_operator';
    const [visitorLogs, feedback] = await Promise.all([
      fetchWithAuth(`/api/visitor-logs${parkQuery}`, token).catch(() => []),
      fetchWithAuth(feedbackPath, token).catch(() => [])
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
      parks,
      activeParkId: chosenPark,
      visitorLogs,
      feedback,
      operatorSummary: operatorTotals
    });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).render('error', { message: 'Unable to load dashboard' });
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
