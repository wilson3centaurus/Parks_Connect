import fs from 'fs';
import path from 'path';
import { once } from 'events';
import { fileURLToPath } from 'url';
import PDFDocument from 'pdfkit';
import { getDb } from '../utils/db.js';
import { getAssignedParkIds, normalizeRole } from '../utils/parks.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const exportsDir = path.join(__dirname, '..', 'exports');

if (!fs.existsSync(exportsDir)) {
  fs.mkdirSync(exportsDir, { recursive: true });
}

function buildFilters({ alias, parkIds, dateColumn, startDate, endDate }) {
  const filters = [];
  const params = [];

  if (parkIds !== null) {
    if (!parkIds || parkIds.length === 0) {
      filters.push(`${alias}.park_id IN (NULL)`);
    } else {
      filters.push(`${alias}.park_id IN (${parkIds.map(() => '?').join(',')})`);
      params.push(...parkIds);
    }
  }

  if (startDate) {
    filters.push(`${alias}.${dateColumn} >= ?`);
    params.push(startDate);
  }
  if (endDate) {
    filters.push(`${alias}.${dateColumn} <= ?`);
    params.push(endDate);
  }

  return {
    whereClause: filters.length ? `WHERE ${filters.join(' AND ')}` : '',
    params
  };
}

function sanitizeFilename(value) {
  return String(value || 'report')
    .toLowerCase()
    .replace(/[^a-z0-9_\-.]/g, '_')
    .replace(/_+/g, '_');
}

function buildCsv(rows) {
  if (!rows || rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(
      headers
        .map((key) => {
          const value = row[key] ?? '';
          if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        })
        .join(',')
    );
  }
  return lines.join('\n');
}

async function createPdfFile({ reportType, title, subtitle, sections }) {
  const filename = `${sanitizeFilename(reportType)}_${Date.now()}.pdf`;
  const absolutePath = path.join(exportsDir, filename);
  const publicUrl = `/exports/${filename}`;

  const doc = new PDFDocument({ margin: 42, size: 'A4' });
  const out = fs.createWriteStream(absolutePath);
  doc.pipe(out);

  doc.rect(0, 0, doc.page.width, 84).fill('#0B6E4F');
  doc.fillColor('#FFFFFF').fontSize(20).text('Parks Connect', 42, 24);
  doc.fontSize(12).text(title, 42, 52);

  doc.moveDown(3);
  doc.fillColor('#1F2937').fontSize(10).text(subtitle);
  doc.moveDown(1.5);

  for (const section of sections) {
    doc.fillColor('#0B6E4F').fontSize(12).text(section.title);
    doc.moveDown(0.5);
    doc.fillColor('#1F2937').fontSize(9);

    if (!section.rows || section.rows.length === 0) {
      doc.text('No records for selected filters.');
      doc.moveDown(0.8);
      continue;
    }

    for (const row of section.rows) {
      const line = Object.entries(row)
        .map(([key, value]) => `${key}: ${value ?? '-'}`)
        .join('   |   ');
      doc.text(line, { width: doc.page.width - 84 });
      doc.moveDown(0.3);
      if (doc.y > doc.page.height - 72) {
        doc.addPage();
      }
    }

    doc.moveDown(0.8);
  }

  doc.end();
  await once(out, 'finish');

  return { filename, absolutePath, publicUrl };
}

async function recordExport(db, { parkId = null, reportType, filePath, fileUrl, generatedBy = null }) {
  await db.run(
    `INSERT INTO report_exports (park_id, report_type, file_path, file_url, generated_by)
     VALUES (?, ?, ?, ?, ?)`,
    [parkId, reportType, filePath, fileUrl, generatedBy]
  );
}

async function resolveScope(req) {
  const role = normalizeRole(req.user.role);
  const parkFilter = req.query.park_id ? Number(req.query.park_id) : null;
  const allowedParks = await getAssignedParkIds(req.user);
  const parkIds = role === 'authority_admin' ? (parkFilter ? [parkFilter] : null) : allowedParks;
  return {
    parkIds,
    selectedParkId: parkFilter,
    startDate: req.query.start_date || null,
    endDate: req.query.end_date || null
  };
}

function streamPdf(res, absolutePath, filename) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  fs.createReadStream(absolutePath).pipe(res);
}

export async function exportVisitorReport(req, res) {
  const db = await getDb();
  const { startDate, endDate, parkIds } = await resolveScope(req);
  const { format = 'csv' } = req.query;

  if (parkIds && parkIds.length === 0) return res.status(200).send('');

  const filters = buildFilters({
    alias: 'vl',
    parkIds,
    dateColumn: 'log_date',
    startDate,
    endDate
  });

  const rows = await db.all(
    `SELECT p.name as park, vl.log_date, vl.local_visitors, vl.international_visitors, vl.visitors_count, vl.occupancy_rate, vl.units_available, vl.units_occupied, vl.facility_feedback
     FROM visitor_logs vl
     LEFT JOIN parks p ON p.id = vl.park_id
     ${filters.whereClause}
     ORDER BY vl.log_date DESC`,
    filters.params
  );

  const csv = buildCsv(rows);
  const filename = `visitor_report_${Date.now()}.${format === 'excel' ? 'xls' : 'csv'}`;
  res.setHeader('Content-Type', format === 'excel' ? 'application/vnd.ms-excel' : 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(csv);
}

export async function exportParkPerformancePdf(req, res) {
  const db = await getDb();
  const { parkIds, selectedParkId, startDate, endDate } = await resolveScope(req);
  const parkWhereParts = [];
  const parkParams = [];
  if (parkIds !== null) {
    if (!parkIds.length) {
      parkWhereParts.push('id IN (NULL)');
    } else {
      parkWhereParts.push(`id IN (${parkIds.map(() => '?').join(',')})`);
      parkParams.push(...parkIds);
    }
  }
  const parkWhere = parkWhereParts.length ? `WHERE ${parkWhereParts.join(' AND ')}` : '';

  const parks = await db.all(`SELECT id, name FROM parks ${parkWhere} ORDER BY name ASC`, parkParams);

  const visitorFilters = buildFilters({
    alias: 'vl',
    parkIds,
    dateColumn: 'log_date',
    startDate,
    endDate
  });
  const visitorStats = await db.all(
    `SELECT vl.park_id, SUM(vl.visitors_count) AS total_visitors, AVG(vl.occupancy_rate) AS avg_occupancy
     FROM visitor_logs vl
     ${visitorFilters.whereClause}
     GROUP BY vl.park_id`,
    visitorFilters.params
  );

  const ratingFilters = buildFilters({
    alias: 'tf',
    parkIds,
    dateColumn: 'submitted_at',
    startDate,
    endDate
  });
  const ratingStats = await db.all(
    `SELECT tf.park_id, AVG(tf.rating) AS avg_rating
     FROM tourist_feedback tf
     ${ratingFilters.whereClause}
     GROUP BY tf.park_id`,
    ratingFilters.params
  );

  const incidentFilters = buildFilters({
    alias: 'i',
    parkIds,
    dateColumn: 'reported_at',
    startDate,
    endDate
  });
  const incidentStats = await db.all(
    `SELECT i.park_id, COUNT(*) AS open_incidents
     FROM incidents i
     ${incidentFilters.whereClause ? `${incidentFilters.whereClause} AND` : 'WHERE'} i.status IN ('new','assigned','in_progress','escalated')
     GROUP BY i.park_id`,
    incidentFilters.params
  );

  const visitorByParkId = new Map(visitorStats.map((row) => [row.park_id, row]));
  const ratingByParkId = new Map(ratingStats.map((row) => [row.park_id, row]));
  const incidentsByParkId = new Map(incidentStats.map((row) => [row.park_id, row]));

  const rows = parks.map((park) => ({
    park: park.name,
    total_visitors: Number(visitorByParkId.get(park.id)?.total_visitors || 0),
    avg_occupancy: Number(visitorByParkId.get(park.id)?.avg_occupancy || 0),
    avg_rating: Number(ratingByParkId.get(park.id)?.avg_rating || 0),
    open_incidents: Number(incidentsByParkId.get(park.id)?.open_incidents || 0)
  }));

  const report = await createPdfFile({
    reportType: 'park_performance_report',
    title: 'Park Performance Report',
    subtitle: `Generated: ${new Date().toISOString()}${startDate || endDate ? ` | Range: ${startDate || '...'} to ${endDate || '...'}` : ''}`,
    sections: [
      {
        title: 'Performance Metrics',
        rows: rows.map((row) => ({
          Park: row.park,
          Visitors: row.total_visitors,
          'Avg Occupancy %': (Number(row.avg_occupancy || 0) * 100).toFixed(1),
          'Avg Rating': Number(row.avg_rating || 0).toFixed(2),
          'Open Incidents': row.open_incidents
        }))
      }
    ]
  });

  await recordExport(db, {
    parkId: selectedParkId || null,
    reportType: 'park_performance_report',
    filePath: report.absolutePath,
    fileUrl: report.publicUrl,
    generatedBy: req.user?.id || null
  });

  streamPdf(res, report.absolutePath, report.filename);
}

export async function exportEnvironmentalStatusPdf(req, res) {
  const db = await getDb();
  const { parkIds, selectedParkId, startDate, endDate } = await resolveScope(req);

  const filters = buildFilters({
    alias: 'e',
    parkIds,
    dateColumn: 'created_at',
    startDate,
    endDate
  });

  const rows = await db.all(
    `SELECT
      p.name AS park,
      e.category,
      COUNT(*) AS total_records,
      SUM(CASE WHEN lower(e.severity) IN ('high','critical') THEN 1 ELSE 0 END) AS high_or_critical,
      SUM(CASE WHEN lower(e.status) IN ('new','assigned','in_progress','escalated') THEN 1 ELSE 0 END) AS open_items
     FROM environmental_logs e
     LEFT JOIN parks p ON p.id = e.park_id
     ${filters.whereClause}
     GROUP BY p.name, e.category
     ORDER BY p.name ASC, e.category ASC`,
    filters.params
  );

  const report = await createPdfFile({
    reportType: 'environmental_status_report',
    title: 'Environmental Status Report',
    subtitle: `Generated: ${new Date().toISOString()}${startDate || endDate ? ` | Range: ${startDate || '...'} to ${endDate || '...'}` : ''}`,
    sections: [
      {
        title: 'Category Summary',
        rows: rows.map((row) => ({
          Park: row.park || 'Unknown park',
          Category: row.category,
          Records: row.total_records,
          'High/Critical': row.high_or_critical,
          'Open Items': row.open_items
        }))
      }
    ]
  });

  await recordExport(db, {
    parkId: selectedParkId || null,
    reportType: 'environmental_status_report',
    filePath: report.absolutePath,
    fileUrl: report.publicUrl,
    generatedBy: req.user?.id || null
  });

  streamPdf(res, report.absolutePath, report.filename);
}

export async function exportIncidentResponsePdf(req, res) {
  const db = await getDb();
  const { parkIds, selectedParkId, startDate, endDate } = await resolveScope(req);

  const filters = buildFilters({
    alias: 'i',
    parkIds,
    dateColumn: 'reported_at',
    startDate,
    endDate
  });

  const statusRows = await db.all(
    `SELECT i.status, COUNT(*) AS total
     FROM incidents i
     ${filters.whereClause}
     GROUP BY i.status
     ORDER BY total DESC`,
    filters.params
  );

  const incidentRows = await db.all(
    `SELECT
      p.name AS park,
      i.incident_type,
      i.severity,
      i.status,
      i.reported_at
     FROM incidents i
     LEFT JOIN parks p ON p.id = i.park_id
     ${filters.whereClause}
     ORDER BY i.reported_at DESC
     LIMIT 150`,
    filters.params
  );

  const report = await createPdfFile({
    reportType: 'incident_response_report',
    title: 'Incident Response Report',
    subtitle: `Generated: ${new Date().toISOString()}${startDate || endDate ? ` | Range: ${startDate || '...'} to ${endDate || '...'}` : ''}`,
    sections: [
      {
        title: 'Workflow Status Breakdown',
        rows: statusRows.map((row) => ({
          Status: row.status,
          Count: row.total
        }))
      },
      {
        title: 'Latest Incidents',
        rows: incidentRows.map((row) => ({
          Park: row.park || 'Unknown park',
          Type: row.incident_type,
          Severity: row.severity,
          Status: row.status,
          'Reported At': row.reported_at
        }))
      }
    ]
  });

  await recordExport(db, {
    parkId: selectedParkId || null,
    reportType: 'incident_response_report',
    filePath: report.absolutePath,
    fileUrl: report.publicUrl,
    generatedBy: req.user?.id || null
  });

  streamPdf(res, report.absolutePath, report.filename);
}
