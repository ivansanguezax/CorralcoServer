/**
 * Middleware para manejo centralizado de errores
 */
const errorHandler = (err, req, res, next) => {
    console.error('Error:', err.message);
    
    // Determinar el código de estado
    const statusCode = err.statusCode || 500;
    
    // Responder con el error
    res.status(statusCode).json({
      success: false,
      error: err.message || 'Error del servidor',
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  };
  
  module.exports = errorHandler;