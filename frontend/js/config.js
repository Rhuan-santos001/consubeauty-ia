// ============================================================
// CONFIGURAÇÃO — preencha com os dados do SEU projeto Supabase.
// Estes valores são PÚBLICOS por natureza (chave "anon"), então
// não há problema em deixá-los no frontend. A chave do Gemini
// NUNCA fica aqui — ela mora apenas na Edge Function.
// ============================================================

export const SUPABASE_URL = "https://utzjncyuyysivxqzpdje.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0empuY3l1eXlzaXZ4cXpwZGplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0NzU0MzgsImV4cCI6MjEwMjA1MTQzOH0.JgSQ48mw-6N4Br17kQTcWmdswesikj_UkIgN0g4B_lM";

// Nome da Edge Function que faz a chamada à IA.
export const EDGE_FUNCTION_NAME = "melhorar-resposta";
