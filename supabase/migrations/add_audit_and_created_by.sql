-- 1. Agregar columna created_by a la tabla entries_v4
ALTER TABLE entries_v4 
ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

-- 2. Crear tabla audit_log para el historial de modificaciones
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  action text NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
  table_name text NOT NULL,
  record_id text NOT NULL,
  old_data jsonb,
  new_data jsonb,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Habilitar RLS en audit_log
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- 4. Politica para que los usuarios (o admins) puedan leer el audit_log
CREATE POLICY "Permitir lectura de auditoria a usuarios autenticados" 
ON audit_log FOR SELECT 
TO authenticated 
USING (true);

-- (Nota: La inserción a audit_log la hace un trigger SECURITY DEFINER, por lo que no necesita politica de INSERT)

-- 5. Crear la función y el trigger de auditoría automatizada
CREATE OR REPLACE FUNCTION audit_entry_changes()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log (user_id, action, table_name,
    record_id, old_data, new_data)
  VALUES (
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    COALESCE(NEW.id::text, OLD.id::text),
    CASE WHEN TG_OP = 'DELETE' THEN row_to_json(OLD)::jsonb
         WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD)::jsonb
         ELSE NULL END,
    CASE WHEN TG_OP = 'INSERT' THEN row_to_json(NEW)::jsonb
         WHEN TG_OP = 'UPDATE' THEN row_to_json(NEW)::jsonb
         ELSE NULL END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Eliminar el trigger si ya existía para evitar duplicados
DROP TRIGGER IF EXISTS entries_audit ON entries_v4;

CREATE TRIGGER entries_audit
  AFTER INSERT OR UPDATE OR DELETE ON entries_v4
  FOR EACH ROW EXECUTE FUNCTION audit_entry_changes();
