const { validateSlugFormat } = require('../middlewares/validator').helpers;

/**
 * Middleware para validar que el slug de la cabaña existe en la solicitud y tiene un formato válido
 */
const validateCampaignSlug = (req, res, next) => {
  const { slug } = req.params;
  
  // Usar la función auxiliar de validación
  const errors = validateSlugFormat(slug, 'URL');
  
  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: errors[0]
    });
  }
  
  next();
};

module.exports = {
  validateCampaignSlug
};