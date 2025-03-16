// utils/requestQueue.js
class RequestQueue {
    constructor(requestsPerSecond = 2) {
      this.queue = [];
      this.processing = false;
      this.interval = 1000 / requestsPerSecond;
    }
  
    async enqueue(operation) {
      return new Promise((resolve, reject) => {
        this.queue.push({ operation, resolve, reject });
        if (!this.processing) this.processQueue();
      });
    }
  
    async processQueue() {
      if (this.processing || this.queue.length === 0) return;
      this.processing = true;
  
      while (this.queue.length > 0) {
        const { operation, resolve, reject } = this.queue.shift();
        try {
          const result = await operation();
          resolve(result);
        } catch (error) {
          reject(error);
        }
        
        // Esperar antes de la siguiente solicitud
        await new Promise(resolve => setTimeout(resolve, this.interval));
      }
  
      this.processing = false;
    }
  }
  
  // Exportar una instancia única
  const notionQueue = new RequestQueue(2); // 2 solicitudes por segundo
  module.exports = notionQueue;