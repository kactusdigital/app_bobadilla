#!/bin/bash
# Script de despliegue automático a servidor propio
# Uso: ./deploy.sh [usuario@servidor] [ruta_destino]
# Ejemplo: ./deploy.sh root@192.168.1.100 /var/www/vivero

# Configuraciones por defecto (Puedes cambiar estos valores para no tener que pasarlos por argumento cada vez)
SSH_USER_HOST=${1:-"usuario@tu-servidor.com"}
DEST_PATH=${2:-"/var/www/html/bobadilla"}

echo "=== Iniciando proceso de build y deploy ==="

# 1. Compilar el proyecto
echo "-> Ejecutando npm run build..."
npm run build
if [ $? -ne 0 ]; then
  echo "❌ Error en el proceso de build. Abortando deploy."
  exit 1
fi

# (El version.json ya está en public/ y se copiará automáticamente a dist/ por Vite)

# 2. Despliegue con rsync (recomendado) o scp
echo "-> Subiendo archivos a $SSH_USER_HOST:$DEST_PATH ..."
# Usamos rsync para mayor velocidad (solo sube lo modificado)
# Si tu servidor no tiene rsync, puedes usar scp: scp -r dist/* $SSH_USER_HOST:$DEST_PATH
rsync -avz --delete dist/ $SSH_USER_HOST:$DEST_PATH

if [ $? -eq 0 ]; then
  echo "✅ Despliegue completado con éxito a $SSH_USER_HOST:$DEST_PATH"
else
  echo "❌ Error al subir los archivos."
  echo "Por favor verifica:"
  echo "- Tu conexión a internet"
  echo "- Que el usuario/servidor SSH sea correcto"
  echo "- Que tengas permisos de escritura en la ruta de destino"
  exit 1
fi
