const cron = require('node-cron');
const horariosService = require('../services/horariosService');
const { cacheService, isUsingFallback } = require('../config/cache');

// Limpiar reservas pendientes que han expirado - corre cada hora
const cleanExpiredReservations = cron.schedule('0 * * * *', async () => {
  console.log('Ejecutando limpieza de reservas expiradas...');
  try {
    const result = await horariosService.cleanExpiredPendingReservations();
    console.log(result.message);
  } catch (error) {
    console.error('Error en limpieza programada de reservas:', error);
  }
});

// Limpiar caché completamente - corre a las 3 AM todos los días
// Esto es útil para asegurar sincronización completa con la base de datos
const cleanAllCache = cron.schedule('0 3 * * *', async () => {
  console.log('Limpiando toda la caché...');
  try {
    // Limpiar todas las claves de campaña
    await cacheService.delByPattern('campaign:*');
    await cacheService.delByPattern('campaigns:*');
    console.log('Caché limpiada exitosamente');
  } catch (error) {
    console.error('Error en limpieza programada de caché:', error);
  }
});

// Iniciar todas las tareas programadas
const startCronJobs = () => {
  // Siempre ejecutar la limpieza de reservas
  cleanExpiredReservations.start();
  console.log('Tarea programada iniciada: Limpieza de reservas expiradas');
  
  // Indicar qué tipo de caché se está utilizando
  if (isUsingFallback()) {
    console.log('Usando caché en memoria - No se necesita limpieza programada de Redis');
  } else {
    cleanAllCache.start();
    console.log('Tarea programada iniciada: Limpieza de caché Redis');
  }
};

module.exports = {
  startCronJobs,
  cleanExpiredReservations,
  cleanAllCache
};