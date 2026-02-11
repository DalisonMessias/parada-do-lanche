
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const supabaseUrl = 'https://obeoiqjwqchwedeupngc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9iZW9pcWp3cWNod2VkZXVwbmdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MDM2MzEsImV4cCI6MjA4NjE3OTYzMX0.HF_3X0E7SnQu51hvVKS03Dbp85OyUHAOca5WROYa4ZU';

export const supabase = createClient(supabaseUrl, supabaseKey);

// Helper para formatar moeda
export const formatCurrency = (cents: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
};
