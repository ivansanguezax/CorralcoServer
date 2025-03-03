/**
 * Middleware para validar los datos de un equipo nuevo
 */
const validateTeamData = (req, res, next) => {
  const { teamName, slug } = req.body;
  
  // Validar campos obligatorios
  if (!teamName) {
    return res.status(400).json({
      success: false,
      error: 'El nombre del equipo es obligatorio'
    });
  }
  
  if (!slug) {
    return res.status(400).json({
      success: false,
      error: 'El slug del equipo es obligatorio'
    });
  }
  
  // Validar formato del slug (solo letras, números, guiones y guiones bajos)
  const slugRegex = /^[a-z0-9-_]+$/;
  if (!slugRegex.test(slug)) {
    return res.status(400).json({
      success: false,
      error: 'El slug solo puede contener letras minúsculas, números, guiones y guiones bajos'
    });
  }
  
  // Validar que el número de atletas sea un número positivo
  if (req.body.athleteCount !== undefined && (isNaN(req.body.athleteCount) || req.body.athleteCount < 0)) {
    return res.status(400).json({
      success: false,
      error: 'El número de atletas debe ser un número positivo'
    });
  }
  
  next();
};

/**
 * Middleware para validar los datos de una cabaña nueva
 */
const validateCampaignData = (req, res, next) => {
  const { name, slug, nrBeds } = req.body;
  
  // Validar campos obligatorios
  if (!name) {
    return res.status(400).json({
      success: false,
      error: 'El nombre de la cabaña es obligatorio'
    });
  }
  
  if (!slug) {
    return res.status(400).json({
      success: false,
      error: 'El slug de la cabaña es obligatorio'
    });
  }
  
  // Validar formato del slug (solo letras, números, guiones y guiones bajos)
  const slugRegex = /^[a-z0-9-_]+$/;
  if (!slugRegex.test(slug)) {
    return res.status(400).json({
      success: false,
      error: 'El slug solo puede contener letras minúsculas, números, guiones y guiones bajos'
    });
  }
  
  // Validar que el número de camas sea un número positivo
  if (nrBeds !== undefined && (isNaN(nrBeds) || nrBeds < 0)) {
    return res.status(400).json({
      success: false,
      error: 'El número de camas debe ser un número positivo'
    });
  }
  
  // Validar formato del link de Maps si existe
  if (req.body.linkMaps) {
    try {
      new URL(req.body.linkMaps);
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: 'El link de Google Maps debe ser una URL válida'
      });
    }
  }
  
  // Validar formato del banner si existe
  if (req.body.banner) {
    try {
      new URL(req.body.banner);
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: 'El banner debe ser una URL válida'
      });
    }
  }
  
  next();
};

module.exports = {
  validateSlug: (req, res, next) => {
    const { slug } = req.params;
    
    if (!slug) {
      return res.status(400).json({
        success: false,
        error: 'El parámetro slug es requerido'
      });
    }
    
    next();
  },
  validateCampaignSlug: (req, res, next) => {
    const { slug } = req.params;
    
    if (!slug) {
      return res.status(400).json({
        success: false,
        error: 'El parámetro slug es requerido'
      });
    }
    
    next();
  },
  validateTeamData,
  validateCampaignData
};