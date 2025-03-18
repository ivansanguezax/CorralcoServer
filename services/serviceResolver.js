// services/serviceResolver.js
let cachedServices = {};

module.exports = {
  registerService: function(name, service) {
    console.log(`Registrando servicio: ${name}`);
    cachedServices[name] = service;
    console.log(`Servicios registrados: ${Object.keys(cachedServices).join(', ')}`);
  },
  
  getService: function(name) {
    console.log(`Intentando obtener servicio: ${name}`);
    const service = cachedServices[name];
    if (!service) {
      console.warn(`Servicio '${name}' no encontrado. Servicios disponibles: ${Object.keys(cachedServices).join(', ')}`);
    }
    return service;
  },
  
  // Método para obtener todos los servicios registrados (para depuración)
  getCachedServices: function() {
    return cachedServices;
  }
};