import { getDb } from '../utils/db.js';
import { getAssignedParkIds, normalizeRole } from '../utils/parks.js';

function buildFilters({ alias, parkIds, parkColumn = 'park_id', dateColumn, startDate, endDate }) {
  const filters = [];
  const params = [];

  if (parkIds !== null) {
    if (!parkIds || parkIds.length === 0) {
      filters.push(`${alias}.${parkColumn} IN (NULL)`);
    } else {
      filters.push(`${alias}.${parkColumn} IN (${parkIds.map(() => '?').join(',')})`);
      params.push(...parkIds);
    }
  }

  if (dateColumn && startDate) {
    filters.push(`${alias}.${dateColumn} >= ?`);
    params.push(startDate);
  }

  if (dateColumn && endDate) {
    filters.push(`${alias}.${dateColumn} <= ?`);
    params.push(endDate);
  }

  return {
    whereClause: filters.length ? `WHERE ${filters.join(' AND ')}` : '',
    params
  };
}

export async function getSummary(req, res) {
  const db = await getDb();
  const role = normalizeRole(req.user.role);
  const { start_date: startDate, end_date: endDate, park_id: parkFilter } = req.query;

  const allowedParks = await getAssignedParkIds(req.user);
  const parkIds =
    role === 'authority_admin' ? (parkFilter ? [Number(parkFilter)] : null) : allowedParks;

  const visitorsFilter = buildFilters({
    alias: 'vl',
    parkIds,
    dateColumn: 'log_date',
    startDate,
    endDate
  });

  const totals = await db.get(
    `SELECT
      COALESCE(SUM(vl.visitors_count), 0) AS visitors,
      COALESCE(AVG(vl.occupancy_rate), 0) AS avgOccupancy,
      COALESCE(SUM(vl.local_visitors), 0) AS localVisitors,
      COALESCE(SUM(vl.international_visitors), 0) AS intlVisitors
     FROM visitor_logs vl
     ${visitorsFilter.whereClause}`,
    visitorsFilter.params
  );

  const feedbackFilter = buildFilters({
    alias: 'f',
    parkIds,
    dateColumn: 'submitted_at',
    startDate,
    endDate
  });

  const avgRatingRow = await db.get(
    `SELECT COALESCE(AVG(f.rating), 0) AS rating
     FROM tourist_feedback f
     ${feedbackFilter.whereClause}`,
    feedbackFilter.params
  );

  const openIssuesRow = await db.get(
    `SELECT COUNT(*) AS count
     FROM tourist_feedback f
     ${feedbackFilter.whereClause ? `${feedbackFilter.whereClause} AND` : 'WHERE'} f.status IN ('new','assigned','in_progress','escalated')`,
    feedbackFilter.params
  );

  const envFilter = buildFilters({
    alias: 'e',
    parkIds,
    dateColumn: 'created_at',
    startDate,
    endDate
  });

  const envCriticalRow = await db.get(
    `SELECT COUNT(*) AS count
     FROM environmental_logs e
     ${envFilter.whereClause ? `${envFilter.whereClause} AND` : 'WHERE'} lower(e.severity) IN ('high','critical')`,
    envFilter.params
  );

  const incidentsFilter = buildFilters({
    alias: 'i',
    parkIds,
    dateColumn: 'reported_at',
    startDate,
    endDate
  });

  const incidentOpenRow = await db.get(
    `SELECT COUNT(*) AS count
     FROM incidents i
     ${incidentsFilter.whereClause ? `${incidentsFilter.whereClause} AND` : 'WHERE'} i.status IN ('new','assigned','in_progress','escalated')`,
    incidentsFilter.params
  );

  const alertsFilter = buildFilters({
    alias: 'a',
    parkIds,
    dateColumn: 'created_at',
    startDate,
    endDate
  });

  const unresolvedAlerts = await db.get(
    `SELECT COUNT(*) AS total
     FROM alerts a
     ${alertsFilter.whereClause ? `${alertsFilter.whereClause} AND` : 'WHERE'} a.status IN ('new','assigned','in_progress','escalated')`,
    alertsFilter.params
  );

  const visitorsByDate = await db.all(
    `SELECT vl.log_date AS label, SUM(vl.visitors_count) AS total
     FROM visitor_logs vl
     ${visitorsFilter.whereClause}
     GROUP BY vl.log_date
     ORDER BY vl.log_date DESC
     LIMIT 14`,
    visitorsFilter.params
  );

  const feedbackTrend = await db.all(
    `SELECT strftime('%Y-%m', f.submitted_at) AS label, AVG(f.rating) AS rating
     FROM tourist_feedback f
     ${feedbackFilter.whereClause}
     GROUP BY label
     ORDER BY label DESC
     LIMIT 6`,
    feedbackFilter.params
  );

  const visitorsByPark = await db.all(
    `SELECT p.id, p.name, SUM(vl.visitors_count) AS totalVisitors, AVG(vl.occupancy_rate) AS occupancy
     FROM visitor_logs vl
     LEFT JOIN parks p ON p.id = vl.park_id
     ${visitorsFilter.whereClause}
     GROUP BY p.id, p.name
     ORDER BY totalVisitors DESC`,
    visitorsFilter.params
  );

  const envByCategory = await db.all(
    `SELECT p.name AS park, e.category, COUNT(*) AS total
     FROM environmental_logs e
     LEFT JOIN parks p ON p.id = e.park_id
     ${envFilter.whereClause}
     GROUP BY p.name, e.category
     ORDER BY total DESC`,
    envFilter.params
  );

  const incidentsByStatus = await db.all(
    `SELECT i.status AS label, COUNT(*) AS total
     FROM incidents i
     ${incidentsFilter.whereClause}
     GROUP BY i.status
     ORDER BY total DESC`,
    incidentsFilter.params
  );

  res.json({
    totals: {
      visitors: totals?.visitors || 0,
      avgOccupancy: totals?.avgOccupancy || 0,
      localVisitors: totals?.localVisitors || 0,
      internationalVisitors: totals?.intlVisitors || 0,
      avgRating: avgRatingRow?.rating || 0,
      openIssues: openIssuesRow?.count || 0,
      envCritical: envCriticalRow?.count || 0,
      openIncidents: incidentOpenRow?.count || 0,
      unresolvedAlerts: unresolvedAlerts?.total || 0
    },
    charts: {
      visitorsByDate,
      feedbackTrend,
      incidentsByStatus
    },
    parks: {
      visitorsByPark,
      envByCategory
    }
  });
}
