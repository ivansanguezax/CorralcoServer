const express = require('express');
const router = express.Router();
const pasajerosService = require('../services/pasajerosService');

// Obtener todos los pasajeros
router.get('/', async (req, res, next) => {
  try {
    const pasajeros = await pasajerosService.getAllPasajeros();
    res.json({
      success: true,
      count: pasajeros.length,
      data: pasajeros
    });
  } catch (error) {
    next(error);
  }
});

// Obtener pasajeros por equipo
router.get('/equipo/:equipoId', async (req, res, next) => {
  try {
    const pasajeros = await pasajerosService.getPasajerosByEquipo(req.params.equipoId);
    res.json({
      success: true,
      count: pasajeros.length,
      data: pasajeros
    });
  } catch (error) {
    next(error);
  }
});

// Obtener un pasajero por su ID
router.get('/:id', async (req, res, next) => {
  try {
    const pasajero = await pasajerosService.getPasajeroById(req.params.id);
    res.json({
      success: true,
      data: pasajero
    });
  } catch (error) {
    if (error.message.includes('Error al buscar pasajero')) {
      return res.status(404).json({
        success: false,
        error: 'Pasajero no encontrado'
      });
    }
    next(error);
  }
});

// Crear un nuevo pasajero
router.post('/', async (req, res, next) => {
  try {
    const { nombre, correo, telefono, equipoId } = req.body;
    
    if (!nombre) {
      return res.status(400).json({
        success: false,
        error: 'El nombre del pasajero es obligatorio'
      });
    }
    
    const pasajero = await pasajerosService.createPasajero({
      nombre,
      correo,
      telefono,
      equipoId
    });
    
    res.status(201).json({
      success: true,
      message: 'Pasajero creado exitosamente',
      data: pasajero
    });
  } catch (error) {
    next(error);
  }
});

// Actualizar un pasajero existente
router.put('/:id', async (req, res, next) => {
  try {
    const pasajero = await pasajerosService.updatePasajero(req.params.id, req.body);
    res.json({
      success: true,
      message: 'Pasajero actualizado exitosamente',
      data: pasajero
    });
  } catch (error) {
    next(error);
  }
});

// Eliminar un pasajero
router.delete('/:id', async (req, res, next) => {
  try {
    await pasajerosService.deletePasajero(req.params.id);
    res.json({
      success: true,
      message: 'Pasajero eliminado exitosamente'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;