-- Añadir columna de transcripción a la tabla whatsapp_messages
ALTER TABLE public.whatsapp_messages ADD COLUMN IF NOT EXISTS transcription text;
