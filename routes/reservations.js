const express = require('express');
const router = express.Router();
const reservationService = require('../services/reservationServices');
const campaignService = require('../services/campaignService');
const serviceResolver = require('../services/serviceResolver');

// Configurar límites específicos para este router
router.use(express.json({ limit: '50mb' }));
router.use(express.urlencoded({ limit: '50mb', extended: true }));

// Middleware para validar imágenes base64
const validateBase64Image = (req, res, next) => {
  const { image } = req.body;
  
  if (!image) {
    return res.status(400).json({ 
      success: false, 
      message: 'No se proporcionó ninguna imagen' 
    });
  }
  
  if (!image.startsWith('data:image')) {
    return res.status(400).json({ 
      success: false, 
      message: 'El formato de imagen no es válido. Debe ser una cadena base64 con prefijo data:image' 
    });
  }
  
  next();
};

// Ruta específica para subir imágenes del equipo
router.post('/team/uploads/upload', validateBase64Image, async (req, res) => {
  try {
    const { image, name = 'image', folder = 'team' } = req.body;
    
    const cloudinaryService = serviceResolver.resolve('cloudinaryService');
    if (!cloudinaryService) {
      return res.status(500).json({ 
        success: false, 
        message: 'Servicio de carga de imágenes no disponible' 
      });
    }
    
    const result = await cloudinaryService.uploadImage(image, name, folder);
    
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error al subir imagen de equipo:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error al subir imagen'
    });
  }
});

// Obtener todas las reservas (activas y futuras)
router.get('/', async (req, res, next) => {
  try {
    const reservations = await reservationService.getAllReservations();
    res.json({
      success: true,
      count: reservations.length,
      data: reservations
    });
  } catch (error) {
    next(error);
  }
});

// Obtener reservas activas (en curso)
router.get('/active', async (req, res, next) => {
  try {
    const reservations = await reservationService.getActiveReservations();
    res.json({
      success: true,
      count: reservations.length,
      data: reservations
    });
  } catch (error) {
    next(error);
  }
});

// Obtener reservas futuras
router.get('/future', async (req, res, next) => {
  try {
    const reservations = await reservationService.getFutureReservations();
    res.json({
      success: true,
      count: reservations.length,
      data: reservations
    });
  } catch (error) {
    next(error);
  }
});

// Obtener reservas por cabaña
router.get('/cabin/:cabinId', async (req, res, next) => {
  try {
    const reservations = await reservationService.getCabinReservations(req.params.cabinId);
    res.json({
      success: true,
      count: reservations.length,
      data: reservations
    });
  } catch (error) {
    next(error);
  }
});

// Obtener reservas por equipo
router.get('/team/:teamId', async (req, res, next) => {
  try {
    const reservations = await reservationService.getTeamReservations(req.params.teamId);
    res.json({
      success: true,
      count: reservations.length,
      data: reservations
    });
  } catch (error) {
    next(error);
  }
});

// Crear una nueva reserva
router.post('/', async (req, res, next) => {
  try {
    const { teamId, cabinId, checkInDate, checkOutDate, precioTotal, numBeds } = req.body;
    
    if (!teamId || !cabinId || !checkInDate || !checkOutDate) {
      return res.status(400).json({
        success: false,
        error: 'Todos los campos son requeridos: teamId, cabinId, checkInDate, checkOutDate'
      });
    }
    
    // Verificar si es un hostal y se necesita numBeds
    const cabin = await campaignService.getCampaignById(cabinId);
    if (cabin.accommodationType === 'Hostal' && !numBeds) {
      return res.status(400).json({
        success: false,
        error: 'Para reservas en hostales, debe especificar el número de camas (numBeds)'
      });
    }
    
    const reservation = await reservationService.createReservation(
      teamId, 
      cabinId, 
      checkInDate, 
      checkOutDate,
      precioTotal,
      parseInt(numBeds) || 1
    );
    
    res.status(201).json({
      success: true,
      message: 'Reserva creada exitosamente en estado Pendiente. Debe confirmarla dentro de las próximas 24 horas.',
      data: reservation
    });
  } catch (error) {
    console.error('Error en POST /reservations:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Confirmar una reserva pendiente
router.post('/:horarioId/confirm', async (req, res, next) => {
  try {
    const { horarioId } = req.params;
    const result = await reservationService.confirmReservation(horarioId);
    res.json({
      success: true,
      message: 'Reserva confirmada exitosamente',
      data: result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Procesar check-in
router.put('/:horarioId/check-in', async (req, res, next) => {
  try {
    const { horarioId } = req.params;
    const result = await reservationService.checkIn(horarioId);
    res.json({
      success: true,
      message: 'Check-in realizado correctamente',
      data: result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Procesar check-out
router.put('/:horarioId/check-out', async (req, res, next) => {
  try {
    const { horarioId } = req.params;
    const result = await reservationService.checkOut(horarioId);
    res.json({
      success: true,
      message: 'Check-out realizado correctamente',
      data: result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Cancelar una reserva
router.delete('/:horarioId', async (req, res, next) => {
  try {
    const { horarioId } = req.params;
    const result = await reservationService.cancelReservation(horarioId);
    res.json({
      success: true,
      message: 'Reserva cancelada correctamente',
      data: result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Limpiar reservas pendientes expiradas (endpoint manual)
router.post('/clean-expired', async (req, res, next) => {
  try {
    const result = await reservationService.cleanExpiredPendingReservations();
    res.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;