const pool = require('../config/db');

function buildParkFilter(parkIds, column = 'ws.park_id') {
  if (parkIds === null) {
    return { clause: '', params: [] };
  }

  if (!parkIds || !parkIds.length) {
    return { clause: ' AND 1 = 0', params: [] };
  }

  return { clause: ` AND ${column} IN (?)`, params: [parkIds] };
}

async function createSighting({ parkId, speciesName, commonName, category, count, latitude, longitude, recordedBy, sightingDate, notes, photo }) {
  const [result] = await pool.query(
    `INSERT INTO wildlife_sightings
      (park_id, species_name, common_name, category, count, latitude, longitude, recorded_by, sighting_date, notes, photo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [parkId, speciesName, commonName, category, count, latitude || null, longitude || null, recordedBy, sightingDate, notes || null, photo || null]
  );

  return result.insertId;
}

async function listSightings({ page, limit, parkId, species, parkIds }) {
  const offset = (page - 1) * limit;
  const conditions = [];
  const params = [];
  const filter = buildParkFilter(parkIds);

  if (parkId) {
    conditions.push('ws.park_id = ?');
    params.push(parkId);
  }

  if (species) {
    conditions.push('(ws.species_name LIKE ? OR ws.common_name LIKE ?)');
    params.push(`%${species}%`, `%${species}%`);
  }

  const additional = conditions.length ? ` AND ${conditions.join(' AND ')}` : '';
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM wildlife_sightings ws
     WHERE 1 = 1 ${filter.clause}${additional}`,
    [...filter.params, ...params]
  );

  const [rows] = await pool.query(
    `SELECT
       ws.*,
       p.name AS park_name,
       CONCAT(u.first_name, ' ', u.surname) AS recorded_by_name
     FROM wildlife_sightings ws
     INNER JOIN parks p ON p.id = ws.park_id
     INNER JOIN users u ON u.id = ws.recorded_by
     WHERE 1 = 1 ${filter.clause}${additional}
     ORDER BY ws.sighting_date DESC
     LIMIT ? OFFSET ?`,
    [...filter.params, ...params, limit, offset]
  );

  return {
    rows,
    total: countRows[0].total
  };
}

async function countThisWeek(parkIds) {
  const filter = buildParkFilter(parkIds);
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM wildlife_sightings ws
     WHERE YEARWEEK(ws.sighting_date, 1) = YEARWEEK(CURDATE(), 1)
       ${filter.clause}`,
    filter.params
  );

  return rows[0].total;
}

async function countThisMonth(parkIds) {
  const filter = buildParkFilter(parkIds);
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM wildlife_sightings ws
     WHERE MONTH(ws.sighting_date) = MONTH(CURDATE())
       AND YEAR(ws.sighting_date) = YEAR(CURDATE())
       ${filter.clause}`,
    filter.params
  );

  return rows[0].total;
}

async function getTopSpecies(parkIds, limit = 10) {
  const filter = buildParkFilter(parkIds);
  const [rows] = await pool.query(
    `SELECT ws.species_name, SUM(ws.count) AS total_count
     FROM wildlife_sightings ws
     WHERE 1 = 1 ${filter.clause}
     GROUP BY ws.species_name
     ORDER BY total_count DESC, ws.species_name ASC
     LIMIT ?`,
    [...filter.params, limit]
  );

  return rows;
}

module.exports = {
  createSighting,
  listSightings,
  countThisWeek,
  countThisMonth,
  getTopSpecies
};
