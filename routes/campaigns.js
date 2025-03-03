const express = require('express');
const router = express.Router();
const campaignService = require('../services/campaignService');
const { validateCampaignSlug, validateCampaignData } = require('../middlewares/validator');

// Obtener todas las cabañas
router.get('/', async (req, res, next) => {
  try {
    const campaigns = await campaignService.getAllCampaigns();
    res.json({
      success: true,
      count: campaigns.length,
      data: campaigns
    });
  } catch (error) {
    next(error);
  }
});

// Obtener cabañas disponibles
router.get('/available', async (req, res, next) => {
  try {
    const campaigns = await campaignService.getAvailableCampaigns();
    res.json({
      success: true,
      count: campaigns.length,
      data: campaigns
    });
  } catch (error) {
    next(error);
  }
});

// Obtener una cabaña por su slug
router.get('/:slug', validateCampaignSlug, async (req, res, next) => {
  try {
    const campaign = await campaignService.getCampaignBySlug(req.params.slug);
    res.json({
      success: true,
      data: campaign
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

// Crear una nueva cabaña
router.post('/', validateCampaignData, async (req, res, next) => {
  try {
    const campaign = await campaignService.createCampaign(req.body);
    res.status(201).json({
      success: true,
      message: 'Cabaña creada exitosamente',
      data: campaign
    });
  } catch (error) {
    if (error.message.includes('Ya existe una cabaña')) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }
    next(error);
  }
});

module.exports = router;