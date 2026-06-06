import { Router } from 'express';
import axios from 'axios';

const router = Router();
const backendUrl = process.env.BACKEND_URL || 'http://localhost:4000';

router.get('/feedback', async (_req, res) => {
  try {
    const parks = await axios.get(`${backendUrl}/api/parks`).then((resp) => resp.data).catch(() => []);
    res.render('feedback', {
      layout: false,
      parks,
      values: {},
      errors: {},
      success: null
    });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).render('error', { message: 'Unable to load feedback form.' });
  }
});

router.post('/feedback', async (req, res) => {
  const values = {
    submitted_by: String(req.body?.submitted_by || '').trim(),
    park_id: String(req.body?.park_id || '').trim(),
    visit_date: String(req.body?.visit_date || '').trim(),
    rating: String(req.body?.rating || '').trim(),
    category: String(req.body?.category || '').trim(),
    comments: String(req.body?.comments || '').trim()
  };

  try {
    await axios.post(`${backendUrl}/api/feedback/public`, values);
    const parks = await axios.get(`${backendUrl}/api/parks`).then((resp) => resp.data).catch(() => []);
    return res.render('feedback', {
      layout: false,
      parks,
      values: {},
      errors: {},
      success: 'Feedback submitted successfully. Thank you for helping ZimParks improve the visitor experience.'
    });
  } catch (err) {
    const parks = await axios.get(`${backendUrl}/api/parks`).then((resp) => resp.data).catch(() => []);
    return res.status(400).render('feedback', {
      layout: false,
      parks,
      values,
      errors: err.response?.data?.errors || { form: err.response?.data?.message || 'Submission failed.' },
      success: null
    });
  }
});

export default router;
