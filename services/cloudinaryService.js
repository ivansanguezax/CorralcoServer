// services/cloudinaryService.js (versión con firma)
const axios = require('axios');
const FormData = require('form-data');
const crypto = require('crypto');
const serviceResolver = require('./serviceResolver');

class CloudinaryService {
  constructor() {
    this.apiKey = process.env.CLOUDINARY_API_KEY || 'WtKE19cmoITBoo72t_x-KbZe_H0';
    this.cloudName = process.env.CLOUDINARY_CLOUD_NAME || 'dfgjenml4'; 
    this.apiSecret = process.env.CLOUDINARY_API_SECRET || ''; // Deberías configurar esto en tus variables de entorno
    this.uploadUrl = `https://api.cloudinary.com/v1_1/${this.cloudName}/image/upload`;
  }

  /**
   * Sube una imagen en base64 a Cloudinary
   * @param {string} base64Image - Imagen en formato base64 (debe incluir el prefijo data:image/...)
   * @param {string} fileName - Nombre para identificar la imagen
   * @param {string} folder - Carpeta en Cloudinary (opcional)
   * @returns {Promise<object>} - URL y detalles de la imagen subida
   */
  async uploadImage(base64Image, fileName, folder = 'accommodation') {
    try {
      console.log(`Intentando subir imagen ${fileName} a la carpeta ${folder}`);
      
      // Asegurarse de que la imagen base64 esté correctamente formateada
      if (!base64Image.startsWith('data:image')) {
        throw new Error('La imagen debe estar en formato base64 con prefijo data:image');
      }

      // Generar timestamp y firma para autenticación
      const timestamp = Math.round(new Date().getTime() / 1000);
      
      // Parámetros para la firma
      const signParams = {
        timestamp: timestamp
      };
      
      if (folder) signParams.folder = folder;
      if (fileName) signParams.public_id = fileName.replace(/\s+/g, '_');
      
      // Generar firma
      const signature = this.generateSignature(signParams);

      // Crear un nuevo FormData real
      const formData = new FormData();
      formData.append('file', base64Image);
      formData.append('api_key', this.apiKey);
      formData.append('timestamp', timestamp);
      formData.append('signature', signature);
      
      if (folder) {
        formData.append('folder', folder);
      }
      
      if (fileName) {
        formData.append('public_id', fileName.replace(/\s+/g, '_'));
      }

      console.log('Enviando solicitud a Cloudinary con firma...');
      
      // Realizar la carga de la imagen con los headers correctos de form-data
      const response = await axios.post(this.uploadUrl, formData, {
        headers: {
          ...formData.getHeaders()
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });

      console.log('Respuesta recibida de Cloudinary:', response.status);
      
      return {
        url: response.data.secure_url,
        publicId: response.data.public_id,
        width: response.data.width,
        height: response.data.height,
        format: response.data.format
      };
    } catch (error) {
      console.error('Error al subir imagen a Cloudinary:', error);
      if (error.response && error.response.data) {
        console.error('Detalles del error:', error.response.data);
      }
      throw new Error(`Error al subir imagen a Cloudinary: ${error.message}`);
    }
  }

  /**
   * Genera una firma para autenticar operaciones en Cloudinary
   * @param {Object} params - Parámetros para incluir en la firma
   * @returns {string} - Firma SHA1
   */
  generateSignature(params) {
    // Crear una cadena ordenada de los parámetros
    const paramString = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');
    
    // Añadir el API Secret
    const stringToSign = paramString + this.apiSecret;
    
    // Crear firma SHA1
    return crypto
      .createHash('sha1')
      .update(stringToSign)
      .digest('hex');
  }
  
  // Resto del código igual...
  async uploadMultipleImages(images, folder = 'accommodation') { /* ... */ }
  async deleteImage(publicId) { /* ... */ }
}

const cloudinaryServiceInstance = new CloudinaryService();
serviceResolver.registerService('cloudinaryService', cloudinaryServiceInstance);

module.exports = cloudinaryServiceInstance;