/**
 * Middleware para validar que el slug de la cabaña existe en la solicitud
 */
const validateCampaignSlug = (req, res, next) => {
    const { slug } = req.params;
    
    if (!slug) {
      return res.status(400).json({
        success: false,
        error: 'El parámetro slug es requerido'
      });
    }
    
    next();
  };
  
  module.exports = {
    validateCampaignSlug
  };