import { getDb } from '../utils/db.js';
import { calculateFeedbackKpis } from '../utils/alertEngine.js';
import { getAssignedParkIds, normalizeRole } from '../utils/parks.js';

function buildFilters({ alias, parkIds, startDate, endDate }) {
  const filters = [];
  const params = [];

  if (parkIds !== null) {
    if (!parkIds.length) {
      filters.push(`${alias}.park_id IN (NULL)`);
    } else {
      filters.push(`${alias}.park_id IN (${parkIds.map(() => '?').join(',')})`);
      params.push(...parkIds);
    }
  }

  if (startDate) {
    filters.push(`${alias}.visit_date >= ?`);
    params.push(startDate);
  }

  if (endDate) {
    filters.push(`${alias}.visit_date <= ?`);
    params.push(endDate);
  }

  return {
    whereClause: filters.length ? `WHERE ${filters.join(' AND ')}` : '',
    params
  };
}

export async function getSummary(req, res) {
  try {
    const db = await getDb();
    const role = normalizeRole(req.user.role);
    const allowedParks = await getAssignedParkIds(req.user);
    const parkIds = role === 'authority_admin'
      ? (req.query.park_id ? [Number(req.query.park_id)] : null)
      : allowedParks;
    const startDate = req.query.start_date || null;
    const endDate = req.query.end_date || null;
    const filters = buildFilters({ alias: 'f', parkIds, startDate, endDate });

    const feedbackRows = await db.all(
      `SELECT f.id, f.park_id, f.rating, f.category, f.channel, f.visit_date, f.comments, p.name AS park_name
       FROM tourist_feedback f
       LEFT JOIN parks p ON p.id = f.park_id
       ${filters.whereClause}
       ORDER BY f.visit_date DESC, f.submitted_at DESC`,
      filters.params
    );

    const kpis = calculateFeedbackKpis(feedbackRows);
    const alertsOpen = await db.get(
      `SELECT COUNT(*) AS total
       FROM alerts a
       ${parkIds === null
         ? `WHERE COALESCE(a.alert_status, CASE WHEN a.status = 'resolved' THEN 'resolved' ELSE 'open' END) IN ('open','acknowledged')`
         : `WHERE a.park_id IN (${parkIds.map(() => '?').join(',')}) AND COALESCE(a.alert_status, CASE WHEN a.status = 'resolved' THEN 'resolved' ELSE 'open' END) IN ('open','acknowledged')`}`,
      parkIds === null ? [] : parkIds
    );

    const dailyVolume = await db.all(
      `SELECT TO_CHAR(f.visit_date, 'YYYY-MM-DD') AS label, COUNT(*) AS total
       FROM tourist_feedback f
       ${filters.whereClause ? `${filters.whereClause} AND` : 'WHERE'} f.visit_date >= CURRENT_DATE - INTERVAL '30 days'
       GROUP BY label
       ORDER BY label ASC`,
      filters.params
    );

    const weeklyVolume = await db.all(
      `SELECT TO_CHAR(DATE_TRUNC('week', f.visit_date), 'YYYY-MM-DD') AS label, COUNT(*) AS total
       FROM tourist_feedback f
       ${filters.whereClause ? `${filters.whereClause} AND` : 'WHERE'} f.visit_date >= CURRENT_DATE - INTERVAL '30 days'
       GROUP BY label
       ORDER BY label ASC`,
      filters.params
    );

    const ratingsByPark = await db.all(
      `SELECT p.name AS label, ROUND(AVG(f.rating)::numeric, 2) AS avg_rating, COUNT(*) AS total
       FROM tourist_feedback f
       LEFT JOIN parks p ON p.id = f.park_id
       ${filters.whereClause}
       GROUP BY p.name
       ORDER BY p.name ASC`,
      filters.params
    );

    const ratingsByCategory = await db.all(
      `SELECT f.category AS label, ROUND(AVG(f.rating)::numeric, 2) AS avg_rating, COUNT(*) AS total
       FROM tourist_feedback f
       ${filters.whereClause}
       GROUP BY f.category
       ORDER BY f.category ASC`,
      filters.params
    );

    return res.json({
      success: true,
      kpis: {
        totalFeedbackCount: kpis.totalFeedbackCount,
        averageRating: kpis.averageRating,
        negativeFeedbackPercentage: kpis.negativeFeedbackPercentage,
        activeAlertsCount: Number(alertsOpen?.total || 0)
      },
      charts: {
        dailyVolume,
        weeklyVolume,
        ratingsByPark,
        ratingsByCategory
      },
      feedbackTable: feedbackRows
    });
  } catch (error) {
    console.error('Failed to build analytics summary', error);
    return res.status(500).json({ success: false, message: 'Failed to build analytics summary', errors: null });
  }
}
