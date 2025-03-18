// controllers/uploadController.js
const express = require('express');
const router = express.Router();
const serviceResolver = require('../services/serviceResolver');

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

// Subir una sola imagen
router.post('/upload', validateBase64Image, async (req, res) => {
  try {
    const { image, name = 'image', folder = 'uploads' } = req.body;
    
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
    console.error('Error al subir imagen:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error al subir imagen'
    });
  }
});

// Subir múltiples imágenes
router.post('/upload-multiple', async (req, res) => {
  try {
    const { images, folder = 'uploads' } = req.body;
    
    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Se requiere un array de imágenes' 
      });
    }
    
    const cloudinaryService = serviceResolver.getService('cloudinaryService'); // Usar getService en lugar de resolve
    if (!cloudinaryService) {
      return res.status(500).json({ 
        success: false, 
        message: 'Servicio de carga de imágenes no disponible' 
      });
    }
    
    // Validar cada imagen
    for (const img of images) {
      if (!img.base64 || !img.base64.startsWith('data:image')) {
        return res.status(400).json({ 
          success: false, 
          message: 'Todas las imágenes deben estar en formato base64 válido' 
        });
      }
    }
    
    const results = await cloudinaryService.uploadMultipleImages(images, folder);
    
    return res.status(200).json({
      success: true,
      data: results
    });
  } catch (error) {
    console.error('Error al subir múltiples imágenes:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error al subir imágenes'
    });
  }
});

// Eliminar una imagen
router.delete('/delete/:publicId', async (req, res) => {
  try {
    const { publicId } = req.params;
    
    if (!publicId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Se requiere el ID público de la imagen' 
      });
    }
    
    const cloudinaryService = serviceResolver.getService('cloudinaryService'); // Usar getService en lugar de resolve
    if (!cloudinaryService) {
      return res.status(500).json({ 
        success: false, 
        message: 'Servicio de carga de imágenes no disponible' 
      });
    }
    
    const result = await cloudinaryService.deleteImage(publicId);
    
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error al eliminar imagen:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error al eliminar imagen'
    });
  }
});

module.exports = router;