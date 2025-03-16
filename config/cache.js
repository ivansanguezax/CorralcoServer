const { createClient } = require('redis');

// Implementación de caché en memoria para fallback
class MemoryCache {
  constructor() {
    this.cache = new Map();
    this.timeouts = new Map();
    console.log('Inicializando caché en memoria');
  }

  async set(key, value, expireSeconds = 300) {
    try {
      // Guardar en caché
      if (typeof value === 'object') {
        value = JSON.stringify(value);
      }
      this.cache.set(key, value);
      
      // Establecer expiración
      if (expireSeconds > 0) {
        // Limpiar timeout existente si hay uno
        if (this.timeouts.has(key)) {
          clearTimeout(this.timeouts.get(key));
        }
        
        // Crear nuevo timeout
        const timeout = setTimeout(() => {
          this.cache.delete(key);
          this.timeouts.delete(key);
        }, expireSeconds * 1000);
        
        this.timeouts.set(key, timeout);
      }
      
      return true;
    } catch (error) {
      console.error(`[MemoryCache] Error guardando: ${key}`, error);
      return false;
    }
  }

  async get(key) {
    try {
      const value = this.cache.get(key);
      if (!value) return null;
      
      // Intentar parsear como JSON, si falla devolver como string
      try {
        return JSON.parse(value);
      } catch (e) {
        return value;
      }
    } catch (error) {
      console.error(`[MemoryCache] Error obteniendo: ${key}`, error);
      return null;
    }
  }

  async del(key) {
    try {
      // Eliminar timeout si existe
      if (this.timeouts.has(key)) {
        clearTimeout(this.timeouts.get(key));
        this.timeouts.delete(key);
      }
      
      // Eliminar de caché
      this.cache.delete(key);
      return true;
    } catch (error) {
      console.error(`[MemoryCache] Error eliminando: ${key}`, error);
      return false;
    }
  }

  async delByPattern(pattern) {
    try {
      const regex = new RegExp(pattern.replace('*', '.*'));
      
      const keysToDelete = [];
      for (const key of this.cache.keys()) {
        if (regex.test(key)) {
          keysToDelete.push(key);
        }
      }
      
      for (const key of keysToDelete) {
        await this.del(key);
      }
      
      return keysToDelete.length;
    } catch (error) {
      console.error(`[MemoryCache] Error eliminando patrón: ${pattern}`, error);
      return 0;
    }
  }

  cleanup() {
    // Limpiar todos los timeouts al apagar
    for (const timeout of this.timeouts.values()) {
      clearTimeout(timeout);
    }
    this.timeouts.clear();
    this.cache.clear();
  }
}

// Clase de caché unificada que maneja automáticamente Redis y MemoryCache
class CacheService {
  constructor() {
    this.memoryCache = new MemoryCache();
    this.redis = null;
    this.usingFallback = true;
    this.isRedisConnected = false;
    this.initRedis();
  }

  async initRedis() {
    try {
      this.redis = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        socket: {
          reconnectStrategy: retries => {
            // Aumentamos los reintentos para entornos de producción
            if (retries >= 20) {
              console.warn('Redis no disponible después de 20 intentos, usando caché en memoria');
              this.usingFallback = true;
              return false; // No intentar más reconexiones
            }
            
            // Backoff exponencial: 100ms, 200ms, 400ms, etc. hasta máximo 60s
            const delay = Math.min(Math.pow(2, retries) * 100, 60000);
            console.log(`Reintentando conexión a Redis en ${delay}ms (intento ${retries})`);
            return delay;
          }
        }
      });
  
      // Manejar eventos de conexión
      this.redis.on('connect', () => {
        console.log('Redis conectado');
        this.isRedisConnected = true;
        this.usingFallback = false;
      });
  
      this.redis.on('error', (err) => {
        if (this.isRedisConnected) {
          console.warn(`Error de Redis: ${err.message}`);
          this.isRedisConnected = false;
        }
        this.usingFallback = true;
      });
  
      await this.redis.connect();
    } catch (error) {
      console.warn('Error al inicializar Redis, usando caché en memoria:', error.message);
      this.usingFallback = true;
      this.isRedisConnected = false;
    }
  }

  // Guardar elemento en caché
  async set(key, value, expireSeconds = 300) {
    try {
      if (this.isRedisConnected && !this.usingFallback) {
        if (typeof value === 'object') {
          value = JSON.stringify(value);
        }

        await this.redis.set(key, value, { EX: expireSeconds });
        return true;
      } else {
        return this.memoryCache.set(key, value, expireSeconds);
      }
    } catch (error) {
      console.error(`Error guardando en caché: ${key}`, error);
      // En caso de error, intentar con memoria
      return this.memoryCache.set(key, value, expireSeconds);
    }
  }

  // Obtener elemento de la caché
  async get(key) {
    try {
      if (this.isRedisConnected && !this.usingFallback) {
        const value = await this.redis.get(key);
        if (!value) return null;
        
        // Intentar parsear como JSON, si falla devolver como string
        try {
          return JSON.parse(value);
        } catch (e) {
          return value;
        }
      } else {
        return this.memoryCache.get(key);
      }
    } catch (error) {
      console.error(`Error obteniendo de caché: ${key}`, error);
      // En caso de error, intentar con memoria
      return this.memoryCache.get(key);
    }
  }

  // Eliminar elemento de la caché
  async del(key) {
    try {
      let result = await this.memoryCache.del(key);
      
      if (this.isRedisConnected && !this.usingFallback) {
        await this.redis.del(key);
      }
      
      return result;
    } catch (error) {
      console.error(`Error eliminando de caché: ${key}`, error);
      // En caso de error, intentar solo con memoria
      return this.memoryCache.del(key);
    }
  }

  // Eliminar elementos por patrón
  async delByPattern(pattern) {
    try {
      // Siempre limpiar la caché en memoria
      const memoryDeleted = await this.memoryCache.delByPattern(pattern);
      
      if (this.isRedisConnected && !this.usingFallback) {
        try {
          // En Redis, usar scan en lugar de keys para mejor rendimiento
          let cursor = 0;
          let redisDeleted = 0;
          
          do {
            const scan = await this.redis.scan(cursor, { MATCH: pattern, COUNT: 100 });
            cursor = scan.cursor;
            
            if (scan.keys.length > 0) {
              await this.redis.del(scan.keys);
              redisDeleted += scan.keys.length;
            }
          } while (cursor !== 0);
          
          return Math.max(memoryDeleted, redisDeleted);
        } catch (redisError) {
          console.error(`Error eliminando patrón en Redis: ${pattern}`, redisError);
          return memoryDeleted;
        }
      }
      
      return memoryDeleted;
    } catch (error) {
      console.error(`Error eliminando patrón de caché: ${pattern}`, error);
      return 0;
    }
  }

  // Realizar ping a Redis
  async ping() {
    if (this.isRedisConnected && !this.usingFallback) {
      try {
        return await this.redis.ping();
      } catch (error) {
        console.error('Error en Redis ping:', error);
        return 'FALLBACK';
      }
    }
    return 'FALLBACK';
  }

  // Cerrar conexiones
  async close() {
    try {
      this.memoryCache.cleanup();
      
      if (this.redis && this.isRedisConnected) {
        await this.redis.quit();
        console.log('Conexión a Redis cerrada correctamente');
      }
    } catch (error) {
      console.error('Error al cerrar conexiones de caché:', error);
    }
  }
}

// Crear instancia única del servicio de caché
const cacheService = new CacheService();

module.exports = {
  cacheService,
  isUsingFallback: () => cacheService.usingFallback
};