const DROUGHT_KEYWORDS = ['dry', 'drought', 'water shortage', 'no water', 'dust'];
const SECURITY_KEYWORDS = ['robbery', 'attack', 'assault', 'danger', 'threat'];

export function containsKeyword(comment, keywords) {
  const text = String(comment || '').trim().toLowerCase();
  return keywords.some((keyword) => text.includes(keyword));
}

export function containsDroughtKeywords(comment) {
  return containsKeyword(comment, DROUGHT_KEYWORDS);
}

export function containsSecurityKeywords(comment) {
  return containsKeyword(comment, SECURITY_KEYWORDS);
}

export function calculateFeedbackKpis(rows) {
  const totalFeedbackCount = rows.length;
  const totalRating = rows.reduce((sum, row) => sum + Number(row.rating || 0), 0);
  const negativeCount = rows.reduce((sum, row) => sum + (Number(row.rating || 0) <= 2 ? 1 : 0), 0);

  return {
    totalFeedbackCount,
    averageRating: totalFeedbackCount ? totalRating / totalFeedbackCount : 0,
    negativeFeedbackPercentage: totalFeedbackCount ? (negativeCount / totalFeedbackCount) * 100 : 0
  };
}

export function detectFeedbackAlerts(feedbackRows, parks = []) {
  const parkMap = new Map(parks.map((park) => [Number(park.id), park]));
  const alerts = [];
  const byPark = new Map();

  for (const row of feedbackRows) {
    const parkId = Number(row.park_id);
    if (!Number.isInteger(parkId)) continue;
    if (!byPark.has(parkId)) byPark.set(parkId, []);
    byPark.get(parkId).push(row);
  }

  for (const [parkId, rows] of byPark.entries()) {
    const park = parkMap.get(parkId) || {};
    const droughtHits = rows.filter((row) => containsDroughtKeywords(row.comments));
    if (droughtHits.length >= 3) {
      alerts.push({
        parkId,
        alertType: 'drought_indicator',
        severity: 'high',
        summaryText: `Drought-related feedback reached ${droughtHits.length} submissions in the last 7 days for ${park.name || `park ${parkId}`}.`
      });
    }

    const infrastructureHits = rows.filter((row) => Number(row.rating || 0) <= 2 && row.category === 'facilities');
    if (infrastructureHits.length >= 5) {
      alerts.push({
        parkId,
        alertType: 'infrastructure_failure',
        severity: 'medium',
        summaryText: `Facilities complaints with ratings <= 2 reached ${infrastructureHits.length} submissions in the last 48 hours for ${park.name || `park ${parkId}`}.`
      });
    }

    const securityHits = rows.filter((row) => (row.category === 'safety' && Number(row.rating || 0) === 1) || containsSecurityKeywords(row.comments));
    if (securityHits.length >= 1) {
      alerts.push({
        parkId,
        alertType: 'security_incident',
        severity: 'critical',
        summaryText: `Security-sensitive feedback detected for ${park.name || `park ${parkId}`}.`
      });
    }

    const capacityLimit = Number(park.daily_capacity_limit || 0);
    if (capacityLimit > 0 && rows.length >= capacityLimit) {
      alerts.push({
        parkId,
        alertType: 'capacity_threshold',
        severity: 'high',
        summaryText: `Daily feedback volume reached ${rows.length}, exceeding the configured capacity limit of ${capacityLimit} for ${park.name || `park ${parkId}`}.`
      });
    }
  }

  return alerts;
}
