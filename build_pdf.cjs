const puppeteer = require('puppeteer');
const fs = require('fs');

const htmlContent = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Manual de Usuario - Bobadilla Viveros</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
    
    body {
      font-family: 'Inter', sans-serif;
      margin: 0;
      padding: 0;
      color: #1a1c1c;
      background-color: #f9fbf8;
    }
    
    .page {
      width: 210mm;
      min-height: 297mm;
      padding: 20mm;
      margin: 10mm auto;
      background: white;
      box-sizing: border-box;
      box-shadow: 0 0 10px rgba(0,0,0,0.1);
    }
    
    .header {
      border-bottom: 3px solid #00450d;
      padding-bottom: 15px;
      margin-bottom: 30px;
      display: flex;
      align-items: center;
      gap: 15px;
    }
    
    .header .logo-box {
      background-color: #00450d;
      color: white;
      width: 50px;
      height: 50px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 12px;
      font-size: 24px;
      font-weight: bold;
    }
    
    .header-text h1 {
      margin: 0;
      color: #00450d;
      font-size: 24px;
    }
    
    .header-text p {
      margin: 5px 0 0;
      color: #717a6d;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    
    .intro {
      background-color: #f3f9f1;
      border-left: 4px solid #006e1c;
      padding: 15px;
      margin-bottom: 30px;
      font-size: 14px;
      line-height: 1.6;
      border-radius: 0 8px 8px 0;
    }
    
    .section {
      margin-bottom: 25px;
      page-break-inside: avoid;
    }
    
    .section-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
    }
    
    .icon {
      background-color: #e8f5e9;
      color: #00450d;
      width: 32px;
      height: 32px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
    }
    
    .section-title {
      font-size: 18px;
      font-weight: bold;
      color: #00450d;
      margin: 0;
    }
    
    .section-content {
      padding-left: 42px;
      font-size: 14px;
      line-height: 1.5;
    }
    
    .highlight {
      background-color: #e2f5e2;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 600;
      color: #00450d;
    }
    
    .role-badge {
      display: inline-block;
      background-color: #ffdad6;
      color: #ba1a1a;
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 10px;
      font-weight: bold;
      margin-left: 8px;
      vertical-align: middle;
    }
    
    ul {
      margin-top: 5px;
      padding-left: 20px;
    }
    
    li {
      margin-bottom: 6px;
    }
    
    .btn-green {
      background-color: #00450d;
      color: white;
      padding: 4px 12px;
      border-radius: 6px;
      font-size: 16px;
      font-weight: bold;
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
    
    .footer {
      margin-top: 40px;
      text-align: center;
      font-size: 12px;
      color: #717a6d;
      border-top: 1px solid #e0e0e0;
      padding-top: 20px;
    }

    /* Print specific settings */
    @media print {
      body { background-color: white; }
      .page { box-shadow: none; margin: 0; padding: 0; width: 100%; height: 100%; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="logo-box">⚲</div>
      <div class="header-text">
        <h1>Manual de Operación Administrativa</h1>
        <p>Bobadilla Viveros - Gestión de Cultivos</p>
      </div>
    </div>
    
    <div class="intro">
      <strong>Objetivo de este documento:</strong> Servir como guía rápida y de inducción para el personal de administración. Aquí se describen las funciones principales de cada pestaña del sistema para la correcta carga, auditoría y liquidación de los registros laborales.
    </div>
    
    <div class="section">
      <div class="section-header">
        <span class="btn-green">+ Nuevo Registro</span>
      </div>
      <div class="section-content">
        <p>Es el punto de entrada diario para registrar el trabajo en campo. Se utiliza para asentar horas, tareas por producción (a destajo), adelantos, descuentos y ausencias.</p>
        <ul>
          <li><strong>Múltiples empleados:</strong> Permite seleccionar a varios trabajadores en simultáneo si realizaron exactamente la misma tarea, ahorrando tiempo de carga.</li>
          <li><strong>Tipo de Labor:</strong> Diferencia si el registro suma al sueldo (Horas/Destajo), si resta (Adelanto/Descuento) o si es informativo (Falta/Vacaciones).</li>
        </ul>
      </div>
    </div>

    <div class="section">
      <div class="section-header">
        <div class="icon">📊</div>
        <h2 class="section-title">Dashboard</h2>
      </div>
      <div class="section-content">
        <p>Panel de resumen general y analítica para visualizar la salud operativa en tiempo real.</p>
        <ul>
          <li>Monitorea el <span class="highlight">costo neto operativo</span> acumulado en el mes o semana seleccionada.</li>
          <li>Muestra gráficos de distribución de costos por actividad (Ej: Poda, Cosecha, Desmalezado).</li>
          <li>Indica cuántos empleados están activos y el volumen de horas trabajadas en el periodo.</li>
        </ul>
      </div>
    </div>

    <div class="section">
      <div class="section-header">
        <div class="icon">📋</div>
        <h2 class="section-title">Registros de Labores</h2>
      </div>
      <div class="section-content">
        <p>La base de datos histórica donde se puede auditar todo lo cargado en el sistema.</p>
        <ul>
          <li><strong>Filtros Avanzados:</strong> Permite filtrar por fechas, empleado, o <strong>Régimen</strong> (Temporario vs. Mensualizado) para encontrar información puntual.</li>
          <li><strong>Edición y Anulación:</strong> Los administradores y encargados pueden corregir errores en registros pasados (el sistema recalcula automáticamente los montos).</li>
          <li><strong>Exportación:</strong> Cuenta con un botón para descargar la vista actual en <span class="highlight">formato Excel</span>, ideal para reportes contables.</li>
        </ul>
      </div>
    </div>

    <div class="section">
      <div class="section-header">
        <div class="icon">💳</div>
        <h2 class="section-title">Liquidación de Haberes</h2>
      </div>
      <div class="section-content">
        <p>Módulo crítico donde se cierran los pagos semanales, quincenales o mensuales de la nómina.</p>
        <ul>
          <li>Agrupa automáticamente todo lo trabajado por cada empleado en las fechas indicadas, calculando su "Sueldo Bruto".</li>
          <li>Resta automáticamente cualquier "Adelanto" o "Descuento" ingresado en ese periodo para dar el <strong>Neto a Pagar</strong>.</li>
          <li><span class="highlight">Arrastre de Saldos Negativos:</span> Si un trabajador pidió más adelanto de lo que trabajó, el sistema permite cerrar la liquidación y automáticamente genera un nuevo registro de "Adelanto" con ese saldo pendiente para la semana siguiente.</li>
          <li>Se pueden emitir planillas Excel separadas para temporarios.</li>
        </ul>
      </div>
    </div>

    <div class="section">
      <div class="section-header">
        <div class="icon">💬</div>
        <h2 class="section-title">Mensajes</h2>
      </div>
      <div class="section-content">
        <p>Bandeja de notificaciones e integraciones.</p>
        <ul>
          <li>Visualiza el estado de los comprobantes enviados vía WhatsApp a los trabajadores.</li>
          <li>Muestra alertas importantes sobre fallas de envío o avisos generales del sistema.</li>
        </ul>
      </div>
    </div>

    <div class="section">
      <div class="section-header">
        <div class="icon">⚙️</div>
        <h2 class="section-title">Configuración General <span class="role-badge">Requiere Permisos</span></h2>
      </div>
      <div class="section-content">
        <p>Panel de administración de datos maestros y seguridad del sistema.</p>
        <ul>
          <li><strong>Gestión de Personal:</strong> Alta y baja de trabajadores, configuración de legajo, régimen (Temporario/Mensualizado), tarifas por hora y sueldos fijos.</li>
          <li><strong>Catálogos:</strong> Agregar zonas/cuadros del vivero, especies de plantas y categorías de labor.</li>
          <li><strong>Respaldo Manual:</strong> Botones para <span class="highlight">descargar un Backup JSON</span> de toda la base de datos a tu computadora local y para restaurarlo si fuera necesario.</li>
          <li><strong>Auditoría:</strong> (Solo Admin) Ver el registro de quién borró o modificó información y dar de alta nuevas cuentas de operadores (roles Visor, Encargado, Administrador).</li>
        </ul>
      </div>
    </div>
    
    <div class="footer">
      Documento generado para capacitación interna • Bobadilla Viveros • Sistema versión 2026
    </div>
  </div>
</body>
</html>
`;

(async () => {
  fs.writeFileSync('temp_manual.html', htmlContent);
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  const filePath = 'file://' + process.cwd() + '/temp_manual.html';
  await page.goto(filePath, { waitUntil: 'networkidle0' });
  
  await page.pdf({
    path: 'Manual_Administracion_Bobadilla.pdf',
    format: 'A4',
    printBackground: true,
    margin: {
      top: '0mm',
      right: '0mm',
      bottom: '0mm',
      left: '0mm'
    }
  });

  await browser.close();
  fs.unlinkSync('temp_manual.html');
  console.log('PDF generado exitosamente en Manual_Administracion_Bobadilla.pdf');
})();
