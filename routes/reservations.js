const express = require('express');
const router = express.Router();
const reservationService = require('../services/reservationService.js');

router.get('/', async (req, res, next) => {
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

router.post('/', async (req, res, next) => {
  try {
    const { teamId, cabinId, checkInDate, checkOutDate } = req.body;
    
    if (!teamId || !cabinId || !checkInDate || !checkOutDate) {
      return res.status(400).json({
        success: false,
        error: 'Todos los campos son requeridos: teamId, cabinId, checkInDate, checkOutDate'
      });
    }
    
    const reservation = await reservationService.createReservation(
      teamId, 
      cabinId, 
      checkInDate, 
      checkOutDate
    );
    
    res.status(201).json({
      success: true,
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

router.put('/:cabinId/check-in', async (req, res, next) => {
  try {
    const { cabinId } = req.params;
    const result = await reservationService.checkIn(cabinId);
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

router.put('/:cabinId/check-out', async (req, res, next) => {
  try {
    const { cabinId } = req.params;
    const result = await reservationService.checkOut(cabinId);
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

router.delete('/:cabinId', async (req, res, next) => {
  try {
    const { cabinId } = req.params;
    const result = await reservationService.cancelReservation(cabinId);
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

module.exports = router;