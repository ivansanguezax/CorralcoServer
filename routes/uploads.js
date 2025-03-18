// routes/uploads.js
const express = require('express');
const router = express.Router();
const serviceResolver = require('../services/serviceResolver');

// Configurar límites específicos para este router
router.use(express.json({ limit: '50mb' }));
router.use(express.urlencoded({ limit: '50mb', extended: true }));

// Middleware para validar imágenes base64
const validateBase64Image = (req, res, next) => {
  const { image } = req.body;
  
  if (!image) {
    return res.status(400).json({ 
      success: false, 
      message: 'No se proporcionó ninguna imagen' 
    });
  }
  
  if (!image.startsWith('data:image')) {
    return res.status(400).json({ 
      success: false, 
      message: 'El formato de imagen no es válido. Debe ser una cadena base64 con prefijo data:image' 
    });
  }
  
  next();
};

// Ruta para subir una sola imagen
// En routes/reservations.js, modifica la parte de la ruta team/uploads/upload
router.post('/team/uploads/upload', validateBase64Image, async (req, res) => {
    try {
      const { image, name = 'image', folder = 'team' } = req.body;
      
      const cloudinaryService = serviceResolver.getService('cloudinaryService'); // Usar getService en lugar de resolve
      if (!cloudinaryService) {
        return res.status(500).json({ 
          success: false, 
          message: 'Servicio de carga de imágenes no disponible' 
        });
      }
      
      const result = await cloudinaryService.uploadImage(image, name, folder);
      
      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error al subir imagen de equipo:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Error al subir imagen'
      });
    }
  });

// Exportar el router
module.exports = router;