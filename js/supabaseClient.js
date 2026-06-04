import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  alert('Не знайдено VITE_SUPABASE_URL або VITE_SUPABASE_KEY у Vercel Environment Variables');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

export function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>'"]/g, m => ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    "'":'&#039;',
    '"':'&quot;'
  }[m]));
}
