const express = require('express');
const router = express.Router();
const notionService = require('../services/notionService');
const { validateSlug, validateTeamData } = require('../middlewares/validator');

// Obtener todos los equipos
router.get('/', async (req, res, next) => {
  try {
    const teams = await notionService.getAllTeams();
    res.json({
      success: true,
      count: teams.length,
      data: teams
    });
  } catch (error) {
    next(error);
  }
});

// Obtener un equipo por su slug
router.get('/:slug', validateSlug, async (req, res, next) => {
  try {
    const team = await notionService.getTeamBySlug(req.params.slug);
    res.json({
      success: true,
      data: team
    });
  } catch (error) {
    if (error.message.includes('No se encontró')) {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }
    next(error);
  }
});

// Crear un nuevo equipo
router.post('/', validateTeamData, async (req, res, next) => {
  try {
    const team = await notionService.createTeam(req.body);
    res.status(201).json({
      success: true,
      message: 'Equipo creado exitosamente',
      data: team
    });
  } catch (error) {
    if (error.message.includes('Ya existe un equipo')) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }
    next(error);
  }
});

module.exports = router;