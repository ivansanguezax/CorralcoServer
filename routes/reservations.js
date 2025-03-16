const express = require('express');
const router = express.Router();
const reservationService = require('../services/reservationServices');
const campaignService = require('../services/campaignService');

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