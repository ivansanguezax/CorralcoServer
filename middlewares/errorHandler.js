/**
 * Middleware para manejo centralizado de errores en la aplicación
 */

// Mapeo de tipos de errores conocidos
const ERROR_TYPES = {
  NOTION: 'NotionError',
  REDIS: 'RedisError',
  VALIDATION: 'ValidationError',
  NOT_FOUND: 'NotFoundError',
  AUTHORIZATION: 'AuthorizationError',
  RATE_LIMIT: 'RateLimitError',
  BUSINESS_LOGIC: 'BusinessLogicError'
};

// Clasificar tipo de error
const classifyError = (error) => {
  // Comprobar si es un error de Notion API
  if (error.name === 'APIResponseError' || 
      error.code === 'notionhq_client_response_error' || 
      error.message.includes('Notion')) {
    return ERROR_TYPES.NOTION;
  }
  
  // Comprobar si es un error de Redis
  if (error.name === 'RedisError' || 
      error.message.includes('redis') || 
      error.message.includes('Redis')) {
    return ERROR_TYPES.REDIS;
  }
  
  // Errores de validación
  if (error.name === 'ValidationError' || 
      error.message.includes('validación') || 
      error.message.includes('obligatorio') ||
      error.message.includes('inválido')) {
    return ERROR_TYPES.VALIDATION;
  }
  
  // Errores de recursos no encontrados
  if (error.message.includes('No se encontró') || 
      error.message.includes('not found') ||
      error.message.includes('no existe')) {
    return ERROR_TYPES.NOT_FOUND;
  }
  
  // Errores de lógica de negocio (específicos de la aplicación)
  if (error.message.includes('disponible') ||
      error.message.includes('reservada') ||
      error.message.includes('ocupada') ||
      error.message.includes('suficientes camas') ||
      error.message.includes('cabaña') ||
      error.message.includes('hostal')) {
    return ERROR_TYPES.BUSINESS_LOGIC;
  }
  
  // Si no se puede clasificar, es un error general
  return 'GeneralError';
};

// Procesar error para enviar respuesta al cliente
const processError = (error) => {
  const errorType = classifyError(error);
  let statusCode = 500;
  let responseBody = {
    success: false,
    error: error.message || 'Error interno del servidor'
  };
  
  // Configurar código de estado HTTP según tipo de error
  switch (errorType) {
    case ERROR_TYPES.NOTION:
      statusCode = 502; // Bad Gateway para problemas con servicios externos
      responseBody.error = 'Error al comunicarse con Notion: ' + error.message;
      break;
    
    case ERROR_TYPES.REDIS:
      statusCode = 503; // Service Unavailable para problemas con caché
      responseBody.error = 'Error en el sistema de caché: ' + error.message;
      break;
    
    case ERROR_TYPES.VALIDATION:
      statusCode = 400; // Bad Request para errores de validación
      break;
    
    case ERROR_TYPES.NOT_FOUND:
      statusCode = 404; // Not Found para recursos no encontrados
      break;
    
    case ERROR_TYPES.AUTHORIZATION:
      statusCode = 403; // Forbidden para problemas de autorización
      break;
    
    case ERROR_TYPES.RATE_LIMIT:
      statusCode = 429; // Too Many Requests para límite de tasa
      break;
    
    case ERROR_TYPES.BUSINESS_LOGIC:
      statusCode = 400; // Bad Request para errores de lógica de negocio
      break;
    
    default:
      statusCode = 500; // Internal Server Error para otros casos
      break;
  }
  
  return { statusCode, responseBody };
};

// Middleware de manejo de errores
const errorHandler = (err, req, res, next) => {
  // Log detallado del error para depuración
  console.error(`[${new Date().toISOString()}] Error en ${req.method} ${req.url}`);
  console.error('Mensaje de error:', err.message);
  console.error('Pila de llamadas:', err.stack);
  
  // Procesar error y enviar respuesta
  const { statusCode, responseBody } = processError(err);
  
  // Añadir información de depuración en entorno de desarrollo
  if (process.env.NODE_ENV === 'development') {
    responseBody.stack = err.stack;
    responseBody.details = err.details || {};
    responseBody.errorType = classifyError(err);
  }
  
  // Enviar respuesta al cliente
  res.status(statusCode).json(responseBody);
};

module.exports = errorHandler;