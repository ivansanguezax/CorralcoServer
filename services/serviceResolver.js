// services/serviceResolver.js
let cachedServices = {};

module.exports = {
  registerService: function(name, service) {
    cachedServices[name] = service;
  },
  
  getService: function(name) {
    return cachedServices[name];
  }
};