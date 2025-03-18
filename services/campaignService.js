const { notion, campaignsDatabaseId } = require("../config/notion");
const horariosService = require("./horariosService");
const { cacheService } = require("../config/cache");
const notionQueue = require('../utils/requestQueue');
const serviceResolver = require('./serviceResolver');

// Constantes para la caché y configuración
const CACHE_TTL = {
  DEFAULT: 300, // 5 minutos para la mayoría de operaciones
  LONG: 3600, // 1 hora para datos estáticos
  SHORT: 60, // 1 minuto para datos muy dinámicos
  VERY_SHORT: 30, // 30 segundos para disponibilidad
};

const CACHE_KEYS = {
  CAMPAIGN_STATUS: (id) => `campaign:${id}:status`,
  CAMPAIGN_BEDS: (id) => `campaign:${id}:availableBeds`,
  CAMPAIGN_DETAIL: (id) => `campaign:${id}:detail`,
  ALL_CAMPAIGNS: "campaigns:all",
  AVAILABLE_CAMPAIGNS: "campaigns:available",
  RESERVED_CAMPAIGNS: "campaigns:reserved",
  CABINS_ONLY: "campaigns:cabins",
  HOSTELS_ONLY: "campaigns:hostels",
};

// Función de reintento con backoff exponencial
const retry = async (operation, maxRetries = 5, delay = 500) => {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Si el error es "rate_limited", espera más tiempo antes de reintentar
      if (error.code === 'rate_limited') {
        const waitTime = delay * Math.pow(2, attempt - 1); // Backoff exponencial
        console.warn(`Intento ${attempt} fallido por rate limit. Esperando ${waitTime}ms`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      } else {
        console.warn(`Intento ${attempt} fallido:`, error.message);
        if (attempt === maxRetries) throw lastError;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
};

// Convertir promesas en versión con reintentos
const withRetry = (fn) => (...args) => retry(() => fn(...args));


class campaignService {

async getAllCampaigns() {
  try {
    // Función para consultar a Notion con reintentos
    const fetchFromNotion = withRetry(async () => {
      const response = await notion.databases.query({
        database_id: campaignsDatabaseId,
        sorts: [
          {
            property: "Name",
            direction: "ascending",
          },
        ],
      });
      return response;
    });

    const response = await fetchFromNotion();
    const campaigns = this.formatCampaigns(response.results);

    // Procesar y enriquecer los datos
    await this.enrichCampaignsWithStatus(campaigns);

    // También guardar listas filtradas sin caché para mantener consistencia
    const cabañas = campaigns.filter((c) => c.accommodationType === "Cabaña");
    const hostales = campaigns.filter((c) => c.accommodationType === "Hostal");

    return campaigns;
  } catch (error) {
    console.error("Error al obtener los alojamientos:", error);
    throw new Error(
      "Error al obtener los alojamientos desde Notion: " + error.message
    );
  }
}

  async getCabinsByType(type) {
    try {
      const cacheKey =
        type === "Cabaña" ? CACHE_KEYS.CABINS_ONLY : CACHE_KEYS.HOSTELS_ONLY;

      // Intentar obtener desde caché
      const cachedCampaigns = await cacheService.get(cacheKey);
      if (cachedCampaigns) {
        return cachedCampaigns;
      }

      // Si no está en caché, obtener todos y filtrar
      const allCampaigns = await this.getAllCampaigns();
      const filteredCampaigns = allCampaigns.filter(
        (c) => c.accommodationType === type
      );

      // Guardar en caché
      await cacheService.set(cacheKey, filteredCampaigns, CACHE_TTL.DEFAULT);

      return filteredCampaigns;
    } catch (error) {
      console.error(`Error al obtener alojamientos de tipo ${type}:`, error);
      throw new Error(
        `Error al obtener alojamientos de tipo ${type}: ${error.message}`
      );
    }
  }

// Método auxiliar para enriquecer campañas con su estado
async enrichCampaignsWithStatus(campaigns) {
  try {
    // Usar Promise.allSettled para manejar errores en promesas individuales
    const results = await Promise.allSettled(campaigns.map(async (campaign) => {
      try {
        // Determinar el estado actual del alojamiento
        campaign.reservationStatus = await this.determineReservationStatus(campaign.id);

        // Calcular camas disponibles para hostales
        if (campaign.accommodationType === "Hostal") {
          campaign.availableBeds = await this.calculateAvailableBeds(
            campaign.id,
            campaign.totalCapacity
          );
          campaign.occupiedBeds = campaign.totalCapacity - campaign.availableBeds;
        }

        return campaign;
      } catch (error) {
        console.error(`Error al enriquecer campaña ${campaign.id}:`, error);
        // Asignar valores por defecto en caso de error
        campaign.reservationStatus = "Desconocido";
        if (campaign.accommodationType === "Hostal") {
          campaign.availableBeds = 0;
          campaign.occupiedBeds = campaign.totalCapacity || 0;
        }
        return campaign;
      }
    }));

    // Procesar los resultados para mantener el orden original
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        campaigns[index] = result.value;
      }
      // Si está rechazado, la campaña ya fue actualizada en el bloque try/catch interno
    });
  } catch (error) {
    console.error('Error general al enriquecer campañas:', error);
  }
}

  async getCampaignById(cabinId) {
    try {
      // Intentar obtener desde caché
      const cacheKey = CACHE_KEYS.CAMPAIGN_DETAIL(cabinId);
      const cachedCampaign = await cacheService.get(cacheKey);
      if (cachedCampaign) {
        return cachedCampaign;
      }

      // Consultar a Notion con reintentos
      const fetchFromNotion = withRetry(async () => {
        const response = await notion.pages.retrieve({
          page_id: cabinId,
        });
        return response;
      });

      const response = await fetchFromNotion();
      const campaign = this.formatCampaign(response);

      // Determinar el estado actual del alojamiento
      campaign.reservationStatus = await this.determineReservationStatus(
        campaign.id
      );

      // Calcular camas disponibles para hostales
      if (campaign.accommodationType === "Hostal") {
        campaign.availableBeds = await this.calculateAvailableBeds(
          campaign.id,
          campaign.totalCapacity
        );
        campaign.occupiedBeds = campaign.totalCapacity - campaign.availableBeds;
      }

      // Guardar en caché
      await cacheService.set(cacheKey, campaign, CACHE_TTL.DEFAULT);

      return campaign;
    } catch (error) {
      console.error(
        `Error al obtener el alojamiento con ID ${cabinId}:`,
        error
      );
      throw new Error(`Error al buscar alojamiento con ID: ${cabinId}`);
    }
  }

  async getAvailableCampaigns(filterType = null) {
    try {
      console.log("Buscando campañas disponibles...");
      
      const allCampaigns = await this.getAllCampaigns();
      console.log(`Total de campañas obtenidas: ${allCampaigns.length}`);
      
      const availableCampaigns = [];
      
      for (const campaign of allCampaigns) {
        console.log(`Evaluando campaña: ${campaign.name}, Tipo: ${campaign.accommodationType}, Estado: ${campaign.reservationStatus}`);
        
        if (filterType && campaign.accommodationType !== filterType) {
          console.log(`  - Filtrada por tipo (${filterType})`);
          continue;
        }
        
        if (campaign.accommodationType === 'Hostal') {
          console.log(`  - Es hostal con ${campaign.availableBeds} camas disponibles`);
          if (campaign.availableBeds > 0) {
            availableCampaigns.push(campaign);
            console.log(`  - Agregada a disponibles`);
          }
        } else {
          // Para cabañas, considerar disponibles si el estado es 'Disponible' o 'Desconocido'
          if (campaign.reservationStatus === 'Disponible' || campaign.reservationStatus === 'Desconocido') {
            console.log(`  - Es cabaña disponible o con estado desconocido`);
            availableCampaigns.push(campaign);
            console.log(`  - Agregada a disponibles`);
          }
        }
      }
  
      console.log(`Campañas disponibles encontradas: ${availableCampaigns.length}`);
      return availableCampaigns;
    } catch (error) {
      console.error('Error al obtener los alojamientos disponibles:', error);
      throw new Error('Error al obtener los alojamientos disponibles');
    }
  }

  async getReservedCampaigns(filterType = null) {
    try {
      // Clave de caché específica según filtro
      let cacheKey = CACHE_KEYS.RESERVED_CAMPAIGNS;
      if (filterType) {
        cacheKey = `${cacheKey}:${filterType}`;
      }

      // Intentar obtener desde caché
      const cachedCampaigns = await cacheService.get(cacheKey);
      if (cachedCampaigns) {
        return cachedCampaigns;
      }

      // Obtener todas las campañas
      const allCampaigns = await this.getAllCampaigns();
      const reservedCampaigns = [];

      // Filtrar solo los alojamientos reservados u ocupados
      for (const campaign of allCampaigns) {
        // Aplicar filtro por tipo si está definido
        if (filterType && campaign.accommodationType !== filterType) {
          continue;
        }

        // Para hostales, verificar si tienen camas ocupadas
        if (campaign.accommodationType === "Hostal") {
          if (campaign.occupiedBeds > 0) {
            reservedCampaigns.push(campaign);
          }
        } else if (
          campaign.reservationStatus === "Reservada" ||
          campaign.reservationStatus === "Ocupada"
        ) {
          // Para cabañas, verificar estado de reserva
          reservedCampaigns.push(campaign);
        }
      }

      // Guardar en caché
      await cacheService.set(cacheKey, reservedCampaigns, CACHE_TTL.SHORT);

      return reservedCampaigns;
    } catch (error) {
      console.error("Error al obtener los alojamientos reservados:", error);
      throw new Error(
        "Error al obtener los alojamientos reservados: " + error.message
      );
    }
  }

  async getCampaignBySlug(slug) {
    try {
      // Intentar obtener desde caché
      const cacheKey = `campaign:slug:${slug}`;
      const cachedCampaign = await cacheService.get(cacheKey);
      if (cachedCampaign) {
        return cachedCampaign;
      }
  
      // Ejecutar la consulta a través de la cola
      const queryNotionWithQueue = async () => {
        // Usar la función retry global en lugar de redefinirla localmente
        const response = await retry(async () => {
          return await notion.databases.query({
            database_id: campaignsDatabaseId,
            filter: {
              property: "slug",
              rich_text: {
                equals: slug,
              },
            },
          });
        });
        
        if (!response) {
          throw new Error(`Error al consultar la base de datos para el slug ${slug}`);
        }
        
        if (response.results.length === 0) {
          throw new Error(`No se encontró el alojamiento con el slug ${slug}`);
        }
        
        return response;
      };
  
      // Usar la cola para la consulta principal
      const response = await notionQueue.enqueue(queryNotionWithQueue);
      
      // Verificación de seguridad para la respuesta
      if (!response || !response.results || response.results.length === 0) {
        throw new Error(`No se encontró el alojamiento con el slug ${slug}`);
      }
      
      const pageData = this.formatCampaign(response.results[0]);
  
      // Determinar el estado actual del alojamiento (usar cola)
      pageData.reservationStatus = await notionQueue.enqueue(() => 
        this.determineReservationStatus(pageData.id)
      );
  
      // Calcular camas disponibles para hostales (usar cola)
      if (pageData.accommodationType === "Hostal") {
        pageData.availableBeds = await notionQueue.enqueue(() => 
          this.calculateAvailableBeds(pageData.id, pageData.totalCapacity)
        );
        pageData.occupiedBeds = pageData.totalCapacity - pageData.availableBeds;
      }
  
      // Obtener el contenido de la página (usar cola)
      const pageContent = await notionQueue.enqueue(() => 
        this.getPageContent(pageData.id)
      );
  
      // Obtener las reservas usando el servicio resuelto correctamente
      const horariosServiceInstance = require('./serviceResolver').getService('horariosService');
      
      // Verificar que el servicio esté disponible
      if (!horariosServiceInstance) {
        console.warn('Servicio de horarios no disponible, se continuará sin reservas');
        // En lugar de lanzar un error, continuar sin las reservas
        const result = {
          ...pageData,
          content: pageContent,
          reservations: [] // Proporcionar un array vacío por defecto
        };
        
        // Guardar en caché por un tiempo mayor (30 minutos)
        await cacheService.set(cacheKey, result, 1800);
        
        return result;
      }
      
      // Intentar obtener reservas, pero manejar posibles errores
      let reservations = [];
      try {
        reservations = await notionQueue.enqueue(() =>
          horariosServiceInstance.getHorariosByCabana(pageData.id)
        );
      } catch (reservationError) {
        console.error(`Error al obtener reservas para ${pageData.id}:`, reservationError);
        // Continuar sin las reservas en caso de error
      }
  
      // Agregar el contenido y las reservas a los datos de la página
      const result = {
        ...pageData,
        content: pageContent,
        reservations,
      };
  
      // Guardar en caché por un tiempo mayor (30 minutos)
      await cacheService.set(cacheKey, result, 1800);
  
      return result;
    } catch (error) {
      console.error(`Error al obtener el alojamiento con slug ${slug}:`, error);
      throw error;
    }
  }

  async updateCampaignImages(campaignId, imagesData) {
    try {
      // Resolver el servicio de Cloudinary
      const cloudinaryService = serviceResolver.resolve('cloudinaryService');
      
      if (!cloudinaryService) {
        throw new Error('Servicio de Cloudinary no disponible');
      }
      
      const properties = {};
      
      // Procesar banner si está presente
      if (imagesData.banner) {
        const bannerResult = await cloudinaryService.uploadImage(
          imagesData.banner.base64, 
          `${campaignId}_banner`, 
          'accommodation/banners'
        );
        
        properties.banner = {
          url: bannerResult.url
        };
      }
      
      // Procesar imágenes de portada si están presentes
      if (imagesData.coverImages && imagesData.coverImages.length > 0) {
        const coverImagesUploaded = await cloudinaryService.uploadMultipleImages(
          imagesData.coverImages.map((img, index) => ({
            base64: img.base64,
            name: `${campaignId}_cover_${index + 1}`
          })),
          'accommodation/covers'
        );
        
        // Asignar URLs a las propiedades correspondientes
        if (coverImagesUploaded.length > 0) {
          properties.ImageCover1 = { url: coverImagesUploaded[0].url };
        }
        
        if (coverImagesUploaded.length > 1) {
          properties.ImageCover2 = { url: coverImagesUploaded[1].url };
        }
        
        if (coverImagesUploaded.length > 2) {
          properties.ImageCover3 = { url: coverImagesUploaded[2].url };
        }
      }
      
      // Si no hay propiedades para actualizar, salir temprano
      if (Object.keys(properties).length === 0) {
        throw new Error('No se proporcionaron imágenes para actualizar');
      }
      
      // Actualizar página en Notion con reintentos
      const updateInNotion = withRetry(async () => {
        return await notion.pages.update({
          page_id: campaignId,
          properties,
        });
      });
      
      const response = await updateInNotion();
      
      // Invalidar caché para este alojamiento
      await this.invalidateCache(campaignId);
      
      return this.formatCampaign(response);
    } catch (error) {
      console.error(`Error al actualizar imágenes para campaña ${campaignId}:`, error);
      throw new Error(`Error al actualizar imágenes: ${error.message}`);
    }
  }
  
  // También modificar createCampaign para manejar imágenes base64
  async createCampaign(campaignData) {
    try {
      const { 
        name, 
        slug, 
        accommodationType, 
        totalCapacity,     
        category, 
        bathrooms,
        priceNight,
        amenities, 
        direction, 
        linkMaps, 
        banner,
        bannerBase64,
        coverImagesBase64,
        wifi,
        kitchen,
        // Add any other properties you need to handle
      } = campaignData;
  
      // Validar campos requeridos
      if (!name || !slug) {
        throw new Error('El nombre de la cabaña y el slug son obligatorios');
      }
  
      // Verificar si el slug ya existe
      const existingCampaign = await this.checkSlugExists(slug);
      if (existingCampaign) {
        throw new Error(`Ya existe un alojamiento con el slug: ${slug}`);
      }
  
      // Preparar las propiedades para la creación
      const properties = {
        'Name': { 
          title: [{ text: { content: name } }]
        },
        'slug': { 
          rich_text: [{ text: { content: slug } }]
        },
        'AccommodationType': { 
          select: { name: accommodationType || 'Cabaña' }
        },
        'TotalCapacity': { 
          number: totalCapacity || 0
        },
        'Category': { 
          select: { name: category || '' }
        },
        'direction': { 
          rich_text: [{ text: { content: direction || '' } }]
        },
        'linkMaps': { 
          url: linkMaps || ''
        }
      };
  
      // Si se proporciona una URL de banner directamente, usarla
      if (banner) {
        properties['banner'] = { url: banner };
      }
  
      // Añadir campos numéricos si existen
      if (bathrooms !== undefined) {
        properties['bathrooms'] = { number: bathrooms };
      }
  
      if (priceNight !== undefined) {
        properties['PriceNight'] = { number: priceNight };
      }
  
      // Añadir amenities
      if (amenities) {
        if (amenities.gym !== undefined) properties['gym'] = { checkbox: amenities.gym };
        if (amenities.skiroom !== undefined) properties['skiroom'] = { checkbox: amenities.skiroom };
        if (amenities.food !== undefined) properties['food'] = { checkbox: amenities.food };
      }
  
      // Añadir otros checkboxes
      if (wifi !== undefined) properties['Wifi'] = { checkbox: wifi };
      if (kitchen !== undefined) properties['Kitchen'] = { checkbox: kitchen };
  
      // Crear la página en Notion con reintentos
      const createInNotion = withRetry(async () => {
        return await notion.pages.create({
          parent: { database_id: campaignsDatabaseId },
          properties
        });
      });
  
      const response = await createInNotion();
      const newCampaign = this.formatCampaign(response);
      
      // Si hay imágenes base64, subirlas después de crear la campaña
      if (bannerBase64 || (coverImagesBase64 && coverImagesBase64.length > 0)) {
        const imageData = {};
        
        if (bannerBase64) {
          imageData.banner = { base64: bannerBase64 };
        }
        
        if (coverImagesBase64 && coverImagesBase64.length > 0) {
          imageData.coverImages = coverImagesBase64.map((base64, index) => ({
            base64,
            name: `${slug}_cover_${index + 1}`
          }));
        }
        
        // Actualizar la campaña con las imágenes
        await this.updateCampaignImages(newCampaign.id, imageData);
        
        // Obtener la versión actualizada
        return await this.getCampaignById(newCampaign.id);
      }
  
      return newCampaign;
    } catch (error) {
      console.error('Error al crear alojamiento en Notion:', error);
      throw new Error(`Error al crear alojamiento: ${error.message}`);
    }
  }


async checkSlugExists(slug) {
  try {
    // Implementar función de reintentos para manejar límites de tasa
    const retryOperation = async (operation, maxRetries = 5, delay = 500) => {
      let lastError;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          return await operation();
        } catch (error) {
          lastError = error;

          // Si el error es "rate_limited", espera más tiempo antes de reintentar
          if (error.code === 'rate_limited') {
            const waitTime = delay * Math.pow(2, attempt - 1); // Backoff exponencial
            console.warn(`Intento ${attempt} fallido por rate limit. Esperando ${waitTime}ms`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          } else {
            console.warn(`Intento ${attempt} fallido:`, error.message);
            if (attempt === maxRetries) throw error;
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      throw lastError;
    };
    
    const response = await retryOperation(async () => {
      return await notion.databases.query({
        database_id: campaignsDatabaseId, // Usar campaignsDatabaseId en lugar de databaseId
        filter: {
          property: 'slug', // Asegúrate de que el nombre de la propiedad sea exactamente como aparece en Notion
          rich_text: {
            equals: slug
          }
        }
      });
    });
    
    return response.results.length > 0;
  } catch (error) {
    console.error(`Error al verificar slug ${slug}:`, error);
    throw new Error(`Error al verificar slug: ${error.message}`);
  }
}

  async updateCampaign(cabinId, data) {
    try {
      const {
        name,
        accommodationType,
        totalCapacity,
        category,
        amenities,
        direction,
        linkMaps,
        banner,
      } = data;

      const properties = {};

      if (name) {
        properties["Name"] = {
          title: [
            {
              text: {
                content: name,
              },
            },
          ],
        };
      }

      if (accommodationType) {
        properties["AccommodationType"] = {
          select: {
            name: accommodationType,
          },
        };
      }

      if (totalCapacity !== undefined) {
        properties["TotalCapacity"] = {
          number: totalCapacity,
        };
      }

      if (category) {
        properties["Category"] = {
          select: {
            name: category,
          },
        };
      }

      if (amenities) {
        if (amenities.gym !== undefined) {
          properties["gym"] = {
            checkbox: amenities.gym,
          };
        }

        if (amenities.skiroom !== undefined) {
          properties["skiroom"] = {
            checkbox: amenities.skiroom,
          };
        }

        if (amenities.food !== undefined) {
          properties["food"] = {
            checkbox: amenities.food,
          };
        }
      }

      if (direction) {
        properties["direction"] = {
          rich_text: [
            {
              text: {
                content: direction,
              },
            },
          ],
        };
      }

      if (linkMaps) {
        properties["linkMaps"] = {
          url: linkMaps,
        };
      }

      if (banner) {
        properties["banner"] = {
          url: banner,
        };
      }

      // Actualizar página en Notion con reintentos
      const updateInNotion = withRetry(async () => {
        return await notion.pages.update({
          page_id: cabinId,
          properties,
        });
      });

      const response = await updateInNotion();

      const campaign = this.formatCampaign(response);
      campaign.reservationStatus = await this.determineReservationStatus(
        campaign.id
      );

      // Calcular camas disponibles para hostales
      if (campaign.accommodationType === "Hostal") {
        campaign.availableBeds = await this.calculateAvailableBeds(
          campaign.id,
          campaign.totalCapacity
        );
        campaign.occupiedBeds = campaign.totalCapacity - campaign.availableBeds;
      }

      // Invalidar caché para este alojamiento y cachés globales
      await this.invalidateCache(cabinId);

      return campaign;
    } catch (error) {
      console.error(`Error al actualizar el alojamiento ${cabinId}:`, error);
      throw new Error("Error al actualizar el alojamiento: " + error.message);
    }
  }

  async determineReservationStatus(cabinId) {
    try {
      const cacheKey = CACHE_KEYS.CAMPAIGN_STATUS(cabinId);
      const cachedStatus = await cacheService.get(cacheKey);
      if (cachedStatus) return cachedStatus;
  
      // Consulta directa a Notion sin usar getCampaignById para evitar recursión
      const campaignResponse = await notion.pages.retrieve({
        page_id: cabinId
      });
      
      const campaign = this.formatCampaign(campaignResponse);
      const currentDate = new Date().toISOString().split('T')[0];
      
      let status;
      
      if (campaign.accommodationType === 'Hostal') {
        // Calcular directamente sin llamar a calculateAvailableBeds (que podría causar más recursión)
        const activeReservations = await notion.databases.query({
          database_id: process.env.NOTION_HORARIOS_DATABASE_ID,
          filter: {
            and: [
              { property: 'Cabañas', relation: { contains: cabinId } },
              { property: 'Check-in', date: { on_or_before: currentDate } },
              { property: 'Check-out', date: { on_or_after: currentDate } },
              { property: 'Estado', select: { equals: 'Confirmada' } }
            ]
          }
        });
        
        let occupiedBeds = 0;
        for (const reservation of activeReservations.results) {
          const numBeds = reservation.properties.NrBeds?.number || 1;
          occupiedBeds += numBeds;
        }
        
        const availableBeds = Math.max(0, campaign.totalCapacity - occupiedBeds);
        
        if (availableBeds === 0) {
          status = 'Completo';
        } else if (availableBeds < campaign.totalCapacity) {
          status = 'Parcialmente Ocupado';
        } else {
          status = 'Disponible';
        }
      } else {
        // Para cabañas, verificamos si hay reservas activas
        const activeReservations = await notion.databases.query({
          database_id: process.env.NOTION_HORARIOS_DATABASE_ID,
          filter: {
            and: [
              { property: 'Cabañas', relation: { contains: cabinId } },
              { property: 'Check-in', date: { on_or_before: currentDate } },
              { property: 'Check-out', date: { on_or_after: currentDate } },
              { property: 'Estado', select: { equals: 'Confirmada' } }
            ]
          }
        });
        
        if (activeReservations.results.length > 0) {
          status = 'Ocupada';
        } else {
          const futureReservations = await notion.databases.query({
            database_id: process.env.NOTION_HORARIOS_DATABASE_ID,
            filter: {
              and: [
                { property: 'Cabañas', relation: { contains: cabinId } },
                { property: 'Check-in', date: { after: currentDate } },
                { property: 'Estado', select: { equals: 'Confirmada' } }
              ]
            }
          });
          
          status = futureReservations.results.length > 0 ? 'Reservada' : 'Disponible';
        }
      }
      
      await cacheService.set(cacheKey, status, CACHE_TTL.VERY_SHORT);
      return status;
    } catch (error) {
      console.error(`Error al determinar estado de ${cabinId}:`, error);
      return 'Disponible'; // Por defecto considerar disponible en caso de error
    }
  }

async calculateAvailableBeds(hostalId, totalCapacity) {
  try {
      const cacheKey = CACHE_KEYS.CAMPAIGN_BEDS(hostalId);
      const cachedAvailableBeds = await cacheService.get(cacheKey);
      if (cachedAvailableBeds !== null) return parseInt(cachedAvailableBeds);

      const currentDate = new Date().toISOString().split('T')[0];

      const activeReservations = await notion.databases.query({
          database_id: process.env.NOTION_HORARIOS_DATABASE_ID,
          filter: {
              and: [
                  { property: 'Cabañas', relation: { contains: hostalId } },
                  { property: 'Check-in', date: { on_or_before: currentDate } },
                  { property: 'Check-out', date: { on_or_after: currentDate } },
                  { property: 'Estado', select: { equals: 'Confirmada' } }
              ]
          }
      });

      let occupiedBeds = 0;
      for (const reservation of activeReservations.results) {
          const numBeds = reservation.properties.NrBeds?.number || 1;
          occupiedBeds += numBeds;
      }

      const availableBeds = Math.max(0, totalCapacity - occupiedBeds);
      await cacheService.set(cacheKey, availableBeds.toString(), CACHE_TTL.VERY_SHORT);

      return availableBeds;
  } catch (error) {
      console.error(`Error al calcular camas disponibles para ${hostalId}:`, error);
      return 0;
  }
}


  async getPageContent(pageId) {
    try {
      // Obtener los bloques de la página con reintentos
      const getBlocksWithRetry = withRetry(async () => {
        return await notion.blocks.children.list({
          block_id: pageId,
        });
      });

      const blocks = await getBlocksWithRetry();

      // Procesar y formatear los bloques
      return this.formatBlocks(blocks.results);
    } catch (error) {
      console.error(
        `Error al obtener el contenido de la página ${pageId}:`,
        error
      );
      return [];
    }
  }

  formatBlocks(blocks) {
    return blocks.map((block) => {
      // Formateamos según el tipo de bloque
      switch (block.type) {
        case "paragraph":
          return {
            type: "paragraph",
            id: block.id,
            text: block.paragraph.rich_text.map((t) => t.plain_text).join(""),
          };
        case "heading_1":
          return {
            type: "heading_1",
            id: block.id,
            text: block.heading_1.rich_text.map((t) => t.plain_text).join(""),
          };
        case "heading_2":
          return {
            type: "heading_2",
            id: block.id,
            text: block.heading_2.rich_text.map((t) => t.plain_text).join(""),
          };
        case "heading_3":
          return {
            type: "heading_3",
            id: block.id,
            text: block.heading_3.rich_text.map((t) => t.plain_text).join(""),
          };
        case "bulleted_list_item":
          return {
            type: "bulleted_list_item",
            id: block.id,
            text: block.bulleted_list_item.rich_text
              .map((t) => t.plain_text)
              .join(""),
          };
        case "numbered_list_item":
          return {
            type: "numbered_list_item",
            id: block.id,
            text: block.numbered_list_item.rich_text
              .map((t) => t.plain_text)
              .join(""),
          };
        case "to_do":
          return {
            type: "to_do",
            id: block.id,
            text: block.to_do.rich_text.map((t) => t.plain_text).join(""),
            checked: block.to_do.checked,
          };
        case "toggle":
          return {
            type: "toggle",
            id: block.id,
            text: block.toggle.rich_text.map((t) => t.plain_text).join(""),
          };
        case "child_page":
          return {
            type: "child_page",
            id: block.id,
            title: block.child_page.title,
          };
        case "image":
          return {
            type: "image",
            id: block.id,
            url:
              block.image.type === "external"
                ? block.image.external.url
                : block.image.file.url,
            caption: block.image.caption
              ? block.image.caption.map((t) => t.plain_text).join("")
              : "",
          };
        case "divider":
          return {
            type: "divider",
            id: block.id,
          };
        case "quote":
          return {
            type: "quote",
            id: block.id,
            text: block.quote.rich_text.map((t) => t.plain_text).join(""),
          };
        case "code":
          return {
            type: "code",
            id: block.id,
            text: block.code.rich_text.map((t) => t.plain_text).join(""),
            language: block.code.language,
          };
        case "file":
          return {
            type: "file",
            id: block.id,
            url:
              block.file.type === "external"
                ? block.file.external.url
                : block.file.file.url,
            name: block.file.caption
              ? block.file.caption.map((t) => t.plain_text).join("")
              : "File",
          };
        case "bookmark":
          return {
            type: "bookmark",
            id: block.id,
            url: block.bookmark.url,
            caption: block.bookmark.caption
              ? block.bookmark.caption.map((t) => t.plain_text).join("")
              : "",
          };
        case "table":
          return {
            type: "table",
            id: block.id,
          };
        default:
          return {
            type: block.type,
            id: block.id,
            unsupported: true,
          };
      }
    });
  }

  formatCampaign(page) {
    return this.formatCampaigns([page])[0];
  }

// Corregir en la función formatCampaigns
formatCampaigns(pages) {
  return pages.map((page) => {
    const properties = page.properties;

    return {
      id: page.id,
      name: properties.Name?.title?.map(title => title.plain_text).join('') || '',
      slug: properties.slug?.rich_text?.map(text => text.plain_text).join('') || '',
      accommodationType: properties.AccommodationType?.select?.name || 'Cabaña',
      totalCapacity: properties.TotalCapacity?.number || 0,
      bathrooms: properties.bathrooms?.number || 0,
      pricePerNight: properties.PriceNight?.number || 0,
      direction: properties.direction?.rich_text?.map(text => text.plain_text).join('') || '',
      linkMaps: properties.linkMaps?.url || '',
      wifi: properties.Wifi?.checkbox || false,
      kitchen: properties.Kitchen?.checkbox || false,
      gym: properties.gym?.checkbox || false,
      skiroom: properties.skiroom?.checkbox || false,
      food: properties.food?.checkbox || false,
      category: properties.Category?.select?.name || '',
      availableBeds: properties.availableBeds?.number || 0,
      reservationStatus: properties.reservationStatus?.select?.name || 'Disponible',
      admin: properties.Admin?.people?.map(person => ({
        id: person.id,
        name: person.name,
        avatarUrl: person.avatar_url
      })) || [],
      banner: properties.banner?.url || '',
      images: [
        properties.ImageCover1?.url || '',
        properties.ImageCover2?.url || '',
        properties.ImageCover3?.url || ''
      ].filter(img => img !== ''),
      lastEditedTime: page.last_edited_time
    };
  });
}

  // Método para invalidar la caché específica de un alojamiento
  async invalidateCache(cabinId) {
    try {
      // Eliminar las claves específicas
      await cacheService.del(CACHE_KEYS.CAMPAIGN_STATUS(cabinId));
      await cacheService.del(CACHE_KEYS.CAMPAIGN_BEDS(cabinId));
      await cacheService.del(CACHE_KEYS.CAMPAIGN_DETAIL(cabinId));

      // También invalidar las cachés globales
      await this.invalidateGlobalCache();

      return true;
    } catch (error) {
      console.error(`Error al invalidar caché para ${cabinId}:`, error);
      return false;
    }
  }

  // Método para invalidar todas las cachés globales
  async invalidateGlobalCache() {
    try {
      // Eliminar las cachés globales
      await cacheService.del(CACHE_KEYS.ALL_CAMPAIGNS);
      await cacheService.del(CACHE_KEYS.AVAILABLE_CAMPAIGNS);
      await cacheService.del(CACHE_KEYS.RESERVED_CAMPAIGNS);
      await cacheService.del(CACHE_KEYS.CABINS_ONLY);
      await cacheService.del(CACHE_KEYS.HOSTELS_ONLY);

      // También eliminar las cachés con filtros
      await cacheService.delByPattern(`${CACHE_KEYS.AVAILABLE_CAMPAIGNS}:*`);
      await cacheService.delByPattern(`${CACHE_KEYS.RESERVED_CAMPAIGNS}:*`);

      return true;
    } catch (error) {
      console.error("Error al invalidar caché global:", error);
      return false;
    }
  }

  async updateAvailableBeds(hostalId, availableBeds, dateRange = null) {
    try {
      if (dateRange) {
        const cacheKey = `hostal:${hostalId}:bookings`;
        let bookings = await cacheService.get(cacheKey) || {};
        
        const dateKey = `${dateRange.from}_${dateRange.to}`;
        bookings[dateKey] = {
          from: dateRange.from,
          to: dateRange.to,
          bookedBeds: dateRange.beds
        };
        
        await cacheService.set(cacheKey, bookings, CACHE_TTL.LONG);
      }
      
      await notion.pages.update({
        page_id: hostalId,
        properties: {
          "availableBeds": {
            number: availableBeds
          }
        }
      });
      
      await this.invalidateCache(hostalId);
      return true;
    } catch (error) {
      console.error(`Error al actualizar camas disponibles para ${hostalId}:`, error);
      throw new Error(`No se pudo actualizar las camas disponibles: ${error.message}`);
    }
  }
}
module.exports = new campaignService();


const campaignServiceInstance = new campaignService();
serviceResolver.registerService('campaignService', campaignServiceInstance);

module.exports = campaignServiceInstance;