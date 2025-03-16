// Middleware de validación para peticiones a la API

// Validar formato de slug
const validateSlugFormat = (slug, context = 'parámetro') => {
  const errorMessages = [];
  
  if (!slug) {
    errorMessages.push(`El slug es obligatorio en el ${context}`);
  } else {
    // Validar formato de slug: letras, números, guiones y guiones bajos
    const slugRegex = /^[a-z0-9-_]+$/;
    if (!slugRegex.test(slug)) {
      errorMessages.push(`El slug en el ${context} contiene caracteres inválidos. Solo se permiten letras minúsculas, números, guiones y guiones bajos`);
    }
  }
  
  return errorMessages;
};

// Validar formato de fechas
const validateDatesFormat = (checkInDate, checkOutDate, context = 'parámetro') => {
  const errorMessages = [];
  
  if (!checkInDate || !checkOutDate) {
    errorMessages.push(`Las fechas de check-in y check-out son obligatorias en el ${context}`);
    return errorMessages;
  }
  
  // Validar formato de fechas
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(checkInDate)) {
    errorMessages.push(`La fecha de check-in en el ${context} debe tener formato YYYY-MM-DD`);
  }
  
  if (!dateRegex.test(checkOutDate)) {
    errorMessages.push(`La fecha de check-out en el ${context} debe tener formato YYYY-MM-DD`);
  }
  
  // Si ambas fechas tienen formato correcto, validar que check-in sea anterior a check-out
  if (dateRegex.test(checkInDate) && dateRegex.test(checkOutDate)) {
    const checkIn = new Date(checkInDate);
    const checkOut = new Date(checkOutDate);
    
    if (checkIn >= checkOut) {
      errorMessages.push(`La fecha de check-in debe ser anterior a la fecha de check-out en el ${context}`);
    }
  }
  
  return errorMessages;
};

// Validar número de camas
const validateNumBeds = (numBeds, context = 'parámetro') => {
  const errorMessages = [];
  
  if (numBeds !== undefined) {
    const numBedsValue = typeof numBeds === 'string' ? parseInt(numBeds) : numBeds;
    
    if (isNaN(numBedsValue) || numBedsValue <= 0 || !Number.isInteger(numBedsValue)) {
      errorMessages.push(`El número de camas en el ${context} debe ser un número entero positivo`);
    }
  }
  
  return errorMessages;
};

// Validar tipo de alojamiento
const validateAccommodationType = (type, context = 'parámetro') => {
  const errorMessages = [];
  
  if (type && !['Cabaña', 'Hostal'].includes(type)) {
    errorMessages.push(`El tipo de alojamiento en el ${context} debe ser "Cabaña" o "Hostal"`);
  }
  
  return errorMessages;
};

// Middleware: Validar slug en rutas de equipos y cabañas
const validateSlug = (req, res, next) => {
  const { slug } = req.params;
  const errors = validateSlugFormat(slug, 'URL');
  
  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: errors[0]
    });
  }
  
  next();
};

// Middleware: Validar slug específicamente para cabañas
const validateCampaignSlug = validateSlug; // Redefinido para mantener compatibilidad de API

// Middleware: Validar datos de campaña en peticiones POST/PUT
const validateCampaignData = (req, res, next) => {
  const { name, slug, accommodationType, totalCapacity } = req.body;
  const errors = [];
  
  // Validar nombre
  if (!name) {
    errors.push('El nombre del alojamiento es obligatorio');
  }
  
  // Validar slug
  errors.push(...validateSlugFormat(slug, 'cuerpo de la petición'));
  
  // Validar tipo de alojamiento si está presente
  errors.push(...validateAccommodationType(accommodationType, 'cuerpo de la petición'));
  
  // Validar capacidad total para hostales
  if (accommodationType === 'Hostal') {
    if (totalCapacity === undefined || totalCapacity === null) {
      errors.push('Para hostales, debe especificar la capacidad total (totalCapacity)');
    } else if (typeof totalCapacity !== 'number' || totalCapacity <= 0 || !Number.isInteger(totalCapacity)) {
      errors.push('La capacidad total debe ser un número entero positivo');
    }
  }
  
  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: errors[0],
      errors: errors
    });
  }
  
  next();
};

// Middleware: Validar datos de equipo en peticiones POST
const validateTeamData = (req, res, next) => {
  const { teamName, slug } = req.body;
  const errors = [];
  
  if (!teamName) {
    errors.push('El nombre del equipo es obligatorio');
  }
  
  // Validar slug
  errors.push(...validateSlugFormat(slug, 'cuerpo de la petición'));
  
  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: errors[0],
      errors: errors
    });
  }
  
  next();
};

// Middleware: Validar datos de reserva en peticiones POST
const validateReservationData = (req, res, next) => {
  const { teamId, cabinId, checkInDate, checkOutDate, numBeds } = req.body;
  const errors = [];
  
  if (!teamId) {
    errors.push('El ID del equipo (teamId) es obligatorio');
  }
  
  if (!cabinId) {
    errors.push('El ID del alojamiento (cabinId) es obligatorio');
  }
  
  // Validar fechas
  errors.push(...validateDatesFormat(checkInDate, checkOutDate, 'cuerpo de la petición'));
  
  // Validar numBeds
  errors.push(...validateNumBeds(numBeds, 'cuerpo de la petición'));
  
  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: errors[0],
      errors: errors
    });
  }
  
  next();
};

// Middleware: Validar petición de disponibilidad
const validateAvailabilityRequest = (req, res, next) => {
  const { cabanaId } = req.params;
  const { checkInDate, checkOutDate, numBeds } = req.query;
  const errors = [];
  
  if (!cabanaId) {
    errors.push('El ID de alojamiento es obligatorio');
  }
  
  // Validar fechas
  errors.push(...validateDatesFormat(checkInDate, checkOutDate, 'query'));
  
  // Validar numBeds
  errors.push(...validateNumBeds(numBeds, 'query'));
  
  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: errors[0],
      errors: errors
    });
  }
  
  next();
};

module.exports = {
  validateSlug,
  validateCampaignSlug,
  validateTeamData,
  validateCampaignData,
  validateReservationData,
  validateAvailabilityRequest,
  // También exportamos las funciones auxiliares para poder usarlas en tests
  helpers: {
    validateSlugFormat,
    validateDatesFormat,
    validateNumBeds,
    validateAccommodationType
  }
};