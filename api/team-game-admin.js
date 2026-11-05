import { getDb } from './_db.js';

// Team game setup API. This endpoint is read-only until admin authorization is added.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  return res.status(200).json({ status: 'setup-pending', gameMode: 'teams' });
}
