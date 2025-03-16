const express = require('express');
const router = express.Router();
const horariosService = require('../services/horariosService');
const campaignService = require('../services/campaignService');

// Obtener todos los horarios
router.get('/', async (req, res, next) => {
  try {
    const horarios = await horariosService.getAllHorarios();
    res.json({
      success: true,
      count: horarios.length,
      data: horarios
    });
  } catch (error) {
    next(error);
  }
});

// Obtener horarios activos (en curso)
router.get('/active', async (req, res, next) => {
  try {
    const horarios = await horariosService.getActiveHorarios();
    res.json({
      success: true,
      count: horarios.length,
      data: horarios
    });
  } catch (error) {
    next(error);
  }
});

// Obtener horarios futuros
router.get('/future', async (req, res, next) => {
  try {
    const horarios = await horariosService.getFutureHorarios();
    res.json({
      success: true,
      count: horarios.length,
      data: horarios
    });
  } catch (error) {
    next(error);
  }
});

// Obtener horarios por ID de cabaña
router.get('/cabana/:cabanaId', async (req, res, next) => {
  try {
    const horarios = await horariosService.getHorariosByCabana(req.params.cabanaId);
    res.json({
      success: true,
      count: horarios.length,
      data: horarios
    });
  } catch (error) {
    next(error);
  }
});

// Obtener horarios por ID de equipo
router.get('/equipo/:equipoId', async (req, res, next) => {
  try {
    const horarios = await horariosService.getHorariosByEquipo(req.params.equipoId);
    res.json({
      success: true,
      count: horarios.length,
      data: horarios
    });
  } catch (error) {
    next(error);
  }
});

// Obtener un horario por su ID
router.get('/:id', async (req, res, next) => {
  try {
    const horario = await horariosService.getHorarioById(req.params.id);
    res.json({
      success: true,
      data: horario
    });
  } catch (error) {
    if (error.message.includes('Error al buscar horario')) {
      return res.status(404).json({
        success: false,
        error: 'Horario no encontrado'
      });
    }
    next(error);
  }
});

// Verificar disponibilidad de un alojamiento para un periodo específico
// Verificar disponibilidad de un alojamiento para un periodo específico
router.get('/availability/:cabanaId', async (req, res, next) => {
    try {
      console.log('Query params:', req.query);

      // Extraer correctamente los parámetros de la URL
      const checkInDate = req.query.checkindate || req.query.checkInDate;
      const checkOutDate = req.query.checkoutdate || req.query.checkOutDate;
      const numBeds = req.query.numBeds || req.query.numbeds;

      console.log('Fechas extraídas:', { checkInDate, checkOutDate });

      if (!checkInDate || !checkOutDate) {
        return res.status(400).json({
          success: false,
          error: 'Las fechas de check-in y check-out son obligatorias'
        });
      }

      // Validar formato de fechas
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(checkInDate) || !dateRegex.test(checkOutDate)) {
        return res.status(400).json({
          success: false,
          error: 'Formato de fecha incorrecto. Use YYYY-MM-DD'
        });
      }

      try {
        // Obtener información del alojamiento para determinar tipo
        const cabin = await campaignService.getCampaignById(req.params.cabanaId);
        const isHostal = cabin.accommodationType === 'Hostal';

        // Verificar disponibilidad según tipo de alojamiento
        const availability = await horariosService.checkCabanaAvailability(
          req.params.cabanaId,
          checkInDate,
          checkOutDate,
          isHostal && numBeds ? parseInt(numBeds) : 1
        );

        if (isHostal) {
          res.json({
            success: true,
            data: {
              isAvailable: availability.isAvailable,
              availableBeds: availability.availableBeds,
              totalCapacity: availability.totalCapacity,
              requestedBeds: parseInt(numBeds) || 1,
              accommodationType: 'Hostal',
              conflictingReservations: availability.conflictingReservations
            }
          });
        } else {
          res.json({
            success: true,
            data: {
              isAvailable: availability.isAvailable,
              accommodationType: 'Cabaña',
              conflictingReservations: availability.conflictingReservations
            }
          });
        }
      } catch (error) {
        console.error(`Error específico al verificar disponibilidad:`, error);
        return res.status(404).json({
          success: false,
          error: error.message
        });
      }
    } catch (error) {
      console.error('Error general al verificar disponibilidad:', error);
      return res.status(500).json({
        success: false,
        error: 'Error al verificar disponibilidad del alojamiento'
      });
    }
  });


// Confirmar una reserva pendiente
router.post('/:id/confirm', async (req, res, next) => {
  try {
    const horario = await horariosService.confirmHorario(req.params.id);
    
    res.json({
      success: true,
      message: 'Reserva confirmada exitosamente',
      data: horario
    });
  } catch (error) {
    if (error.message.includes('no está disponible') || error.message.includes('No hay suficientes camas')) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }
    next(error);
  }
});

// Crear un nuevo horario (reserva)
router.post('/', async (req, res, next) => {
  try {
    const { cabanaId, equipoId, checkInDate, checkOutDate, precioTotal, numBeds } = req.body;
    
    if (!cabanaId || !checkInDate || !checkOutDate) {
      return res.status(400).json({
        success: false,
        error: 'La cabaña y las fechas de check-in y check-out son obligatorias'
      });
    }
    
    // Obtener información del alojamiento para determinar tipo
    const cabin = await campaignService.getCampaignById(cabanaId);
    const isHostal = cabin.accommodationType === 'Hostal';
    
    // Verificar si se proporcionaron camas para un hostal
    if (isHostal && !numBeds) {
      return res.status(400).json({
        success: false,
        error: 'Para reservas en hostales, debe especificar el número de camas (numBeds)'
      });
    }
    
    const horario = await horariosService.createHorario({
      cabanaId,
      equipoId,
      checkInDate,
      checkOutDate,
      precioTotal,
      numBeds: isHostal ? numBeds : undefined
    });
    
    res.status(201).json({
      success: true,
      message: 'Reserva creada exitosamente en estado Pendiente',
      data: {
        ...horario,
        accommodationType: cabin.accommodationType,
        confirmationNeeded: true
      }
    });
  } catch (error) {
    if (error.message.includes('no está disponible') || error.message.includes('No hay suficientes camas')) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }
    next(error);
  }
});

// Actualizar un horario existente
router.put('/:id', async (req, res, next) => {
  try {
    const horario = await horariosService.updateHorario(req.params.id, req.body);
    res.json({
      success: true,
      message: 'Horario actualizado exitosamente',
      data: horario
    });
  } catch (error) {
    if (error.message.includes('no está disponible') || error.message.includes('No hay suficientes camas')) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }
    next(error);
  }
});

// Cambiar estado de un horario (para check-in, check-out)
router.put('/:id/status', async (req, res, next) => {
  try {
    const { estado } = req.body;
    
    if (!estado) {
      return res.status(400).json({
        success: false,
        error: 'El estado es obligatorio'
      });
    }
    
    // Validar que el estado sea válido
    const validStates = ['Pendiente', 'Confirmada', 'En curso', 'Completada', 'Cancelada'];
    if (!validStates.includes(estado)) {
      return res.status(400).json({
        success: false,
        error: `Estado inválido. Debe ser uno de: ${validStates.join(', ')}`
      });
    }
    
    const horario = await horariosService.updateHorario(req.params.id, { estado });
    
    res.json({
      success: true,
      message: `Estado actualizado a "${estado}" exitosamente`,
      data: horario
    });
  } catch (error) {
    next(error);
  }
});

// Eliminar un horario (cancelar reserva)
router.delete('/:id', async (req, res, next) => {
  try {
    await horariosService.deleteHorario(req.params.id);
    res.json({
      success: true,
      message: 'Horario eliminado exitosamente'
    });
  } catch (error) {
    next(error);
  }
});

// Limpiar reservas pendientes expiradas (endpoint manual)
router.post('/clean-expired', async (req, res, next) => {
  try {
    const result = await horariosService.cleanExpiredPendingReservations();
    res.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;