-- Migración para la tabla whatsapp_messages

CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id text PRIMARY KEY,
  telefono_origen text,
  payload_extraido jsonb,
  status text,
  raw_message jsonb,
  created_at timestamp with time zone DEFAULT now()
);

-- Habilitar Row Level Security
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- Política: Permitir todo a roles autenticados y Service Role (necesario para que el Webhook inserte)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'whatsapp_messages' AND policyname = 'Permitir todo a roles autenticados y Service Role'
  ) THEN
    CREATE POLICY "Permitir todo a roles autenticados y Service Role" 
    ON public.whatsapp_messages
    FOR ALL 
    USING (true)
    WITH CHECK (true);
  END IF;
END
$$;
