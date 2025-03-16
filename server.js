require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const teamsRoutes = require('./routes/teams');
const campaignsRoutes = require('./routes/campaigns');
const reservationsRoutes = require('./routes/reservations');
const horariosRoutes = require('./routes/horarios');
const pasajerosRoutes = require('./routes/pasajeros');
const errorHandler = require('./middlewares/errorHandler');

// Servicios
const horariosService = require('./services/horariosService');
const { cacheService, isUsingFallback } = require('./config/cache');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Rutas
app.use('/api/teams', teamsRoutes);
app.use('/api/campaigns', campaignsRoutes);
app.use('/api/reservations', reservationsRoutes);
app.use('/api/horarios', horariosRoutes);
app.use('/api/pasajeros', pasajerosRoutes);

// Ruta para verificar que el servidor está funcionando
app.get('/', (req, res) => {
  res.send('Notion API está funcionando correctamente');
});

// Ruta para verificar el estado del sistema de caché
app.get('/health/cache', async (req, res) => {
  try {
    const usingFallback = isUsingFallback();
    
    res.json({
      success: true,
      cache: usingFallback ? 'memory' : 'redis',
      message: usingFallback 
        ? 'Usando caché en memoria (Redis no disponible)' 
        : 'Redis está funcionando correctamente'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al verificar el sistema de caché',
      error: error.message
    });
  }
});

// Configurar tareas programadas (cron jobs)
// Limpiar reservas pendientes expiradas cada hora
const cleanExpiredReservationsJob = cron.schedule('0 * * * *', async () => {
  console.log('Ejecutando limpieza automática de reservas pendientes expiradas...');
  try {
    const result = await horariosService.cleanExpiredPendingReservations();
    console.log(result.message);
  } catch (error) {
    console.error('Error en limpieza programada de reservas:', error);
  }
});

// Limpiar caché completamente a las 3 AM todos los días
const cleanCacheJob = cron.schedule('0 3 * * *', async () => {
  console.log('Limpiando caché...');
  try {
    // Limpiar todas las claves relacionadas con alojamientos
    await cacheService.delByPattern('campaign:*');
    await cacheService.delByPattern('campaigns:*');
    console.log('Caché limpiada exitosamente');
  } catch (error) {
    console.error('Error en limpieza programada de caché:', error);
  }
});

// Middleware para manejar errores
app.use(errorHandler);

// Iniciar el servidor
const server = app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
  
  // Iniciar tareas programadas
  cleanExpiredReservationsJob.start();
  console.log('Tarea programada: Limpieza de reservas pendientes expiradas (cada hora)');
  
  // Solo iniciar la limpieza de caché si no estamos usando el fallback en memoria
  if (!isUsingFallback()) {
    cleanCacheJob.start();
    console.log('Tarea programada: Limpieza de caché (3 AM diariamente)');
  } else {
    console.log('Usando caché en memoria - No se requiere limpieza programada');
  }
});

// Manejar cierre de aplicación
process.on('SIGTERM', () => {
  console.log('SIGTERM recibido, cerrando...');
  
  // Detener tareas programadas
  cleanExpiredReservationsJob.stop();
  cleanCacheJob.stop();
  
  // Cerrar servidor HTTP
  server.close(() => {
    console.log('Servidor HTTP cerrado');
    process.exit(0);
  });
});

// Manejar interrupciones
process.on('SIGINT', () => {
  console.log('SIGINT recibido, cerrando...');
  
  // Detener tareas programadas
  cleanExpiredReservationsJob.stop();
  cleanCacheJob.stop();
  
  // Cerrar servidor HTTP
  server.close(() => {
    console.log('Servidor HTTP cerrado');
    process.exit(0);
  });
});

module.exports = app;