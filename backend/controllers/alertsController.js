import { getAssignedParkIds, normalizeRole } from '../utils/parks.js';
import { listOpenAlerts, updateAlertStatus } from '../utils/notifier.js';

export async function listAlerts(req, res) {
  try {
    const role = normalizeRole(req.user.role);
    const allowedParks = await getAssignedParkIds(req.user);
    const requestedParkId = req.query.park_id ? Number(req.query.park_id) : null;
    const parkIds = role === 'authority_admin'
      ? (requestedParkId ? [requestedParkId] : null)
      : (requestedParkId ? allowedParks.filter((parkId) => parkId === requestedParkId) : allowedParks);
    const rows = await listOpenAlerts({ parkIds });
    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Failed to list alerts', error);
    return res.status(500).json({ success: false, message: 'Failed to list alerts', errors: null });
  }
}

export async function acknowledgeAlert(req, res) {
  try {
    const { id } = req.params;
    await updateAlertStatus(id, 'acknowledged');
    return res.json({ success: true, message: 'Alert acknowledged', errors: null });
  } catch (error) {
    console.error('Failed to acknowledge alert', error);
    return res.status(500).json({ success: false, message: 'Failed to acknowledge alert', errors: null });
  }
}

export async function resolveAlert(req, res) {
  try {
    const { id } = req.params;
    await updateAlertStatus(id, 'resolved');
    return res.json({ success: true, message: 'Alert resolved', errors: null });
  } catch (error) {
    console.error('Failed to resolve alert', error);
    return res.status(500).json({ success: false, message: 'Failed to resolve alert', errors: null });
  }
}
