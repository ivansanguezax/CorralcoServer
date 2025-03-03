const { notion, campaignsDatabaseId } = require('../config/notion');

/**
 * Servicio para interactuar con las cabañas en Notion
 */
class CampaignService {
  /**
   * Obtiene todas las cabañas de la base de datos de Notion
   */
  async getAllCampaigns() {
    try {
      const response = await notion.databases.query({
        database_id: campaignsDatabaseId,
        sorts: [
          {
            property: 'Name',
            direction: 'ascending',
          },
        ],
      });

      return this.formatCampaigns(response.results);
    } catch (error) {
      console.error('Error al obtener las cabañas:', error);
      throw new Error('Error al obtener las cabañas desde Notion');
    }
  }

  /**
   * Obtiene una cabaña por su ID
   */
  async getCampaignById(cabinId) {
    try {
      const response = await notion.pages.retrieve({
        page_id: cabinId
      });
      
      return this.formatCampaign(response);
    } catch (error) {
      console.error(`Error al obtener la cabaña con ID ${cabinId}:`, error);
      throw new Error(`Error al buscar cabaña con ID: ${cabinId}`);
    }
  }

  /**
   * Obtiene las cabañas disponibles (que no están reservadas)
   */
  async getAvailableCampaigns() {
    try {
      const response = await notion.databases.query({
        database_id: campaignsDatabaseId,
        filter: {
          property: 'reservation_status',
          select: {
            equals: 'Disponible'
          }
        },
        sorts: [
          {
            property: 'Name',
            direction: 'ascending',
          },
        ],
      });

      return this.formatCampaigns(response.results);
    } catch (error) {
      console.error('Error al obtener las cabañas disponibles:', error);
      throw new Error('Error al obtener las cabañas disponibles desde Notion');
    }
  }

  /**
   * Obtiene cabañas que están reservadas u ocupadas
   */
  async getReservedCabins() {
    try {
      const response = await notion.databases.query({
        database_id: campaignsDatabaseId,
        filter: {
          or: [
            {
              property: 'reservation_status',
              select: {
                equals: 'Reservada'
              }
            },
            {
              property: 'reservation_status',
              select: {
                equals: 'Ocupada'
              }
            }
          ]
        },
        sorts: [
          {
            property: 'Name',
            direction: 'ascending',
          },
        ],
      });

      return this.formatCampaigns(response.results);
    } catch (error) {
      console.error('Error al obtener las cabañas reservadas:', error);
      throw new Error('Error al obtener las cabañas reservadas desde Notion');
    }
  }

  /**
   * Obtiene una cabaña específica por su slug
   */
  async getCampaignBySlug(slug) {
    try {
      const response = await notion.databases.query({
        database_id: campaignsDatabaseId,
        filter: {
          property: 'slug',
          rich_text: {
            equals: slug
          }
        }
      });

      if (response.results.length === 0) {
        throw new Error(`No se encontró la cabaña con el slug ${slug}`);
      }

      const pageData = this.formatCampaign(response.results[0]);
      
      // Obtener el contenido de la página
      const pageContent = await this.getPageContent(pageData.id);
      
      // Agregar el contenido a los datos de la página
      return {
        ...pageData,
        content: pageContent
      };
    } catch (error) {
      console.error(`Error al obtener la cabaña con slug ${slug}:`, error);
      throw error;
    }
  }

  // Agrega este método a tu CampaignService

/**
 * Crea una nueva cabaña en la base de datos de Notion
 * @param {Object} campaignData - Datos de la cabaña a crear
 * @returns {Object} La cabaña creada y formateada
 */
async createCampaign(campaignData) {
    try {
      const { 
        name, 
        slug, 
        nrBeds, 
        category, 
        amenities, 
        direction, 
        linkMaps, 
        banner
      } = campaignData;
      
      // Validar campos requeridos
      if (!name || !slug) {
        throw new Error('El nombre de la cabaña y el slug son obligatorios');
      }
      
      // Verificar si el slug ya existe
      const existingCampaign = await this.checkSlugExists(slug);
      if (existingCampaign) {
        throw new Error(`Ya existe una cabaña con el slug: ${slug}`);
      }
      
      // Preparar las propiedades para la creación
      const properties = {
        'Name': {
          title: [
            {
              text: {
                content: name
              }
            }
          ]
        },
        'slug': {
          rich_text: [
            {
              text: {
                content: slug
              }
            }
          ]
        },
        'reservation_status': {
          select: {
            name: 'Disponible'
          }
        }
      };
      
      // Agregar propiedades opcionales si están presentes
      if (nrBeds !== undefined) {
        properties['NrBeds'] = {
          number: nrBeds
        };
      }
      
      if (category) {
        properties['Category'] = {
          select: {
            name: category
          }
        };
      }
      
      if (amenities) {
        if (amenities.gym !== undefined) {
          properties['gym'] = {
            checkbox: amenities.gym
          };
        }
        
        if (amenities.skiroom !== undefined) {
          properties['skiroom'] = {
            checkbox: amenities.skiroom
          };
        }
        
        if (amenities.food !== undefined) {
          properties['food'] = {
            checkbox: amenities.food
          };
        }
      }
      
      if (direction) {
        properties['direction'] = {
          rich_text: [
            {
              text: {
                content: direction
              }
            }
          ]
        };
      }
      
      if (linkMaps) {
        properties['linkMaps'] = {
          url: linkMaps
        };
      }
      
      if (banner) {
        properties['banner'] = {
          url: banner
        };
      }
      
      // Crear la página en Notion
      const response = await notion.pages.create({
        parent: {
          database_id: campaignsDatabaseId
        },
        properties
      });
      
      return this.formatCampaign(response);
    } catch (error) {
      console.error('Error al crear cabaña en Notion:', error);
      throw new Error(`Error al crear cabaña: ${error.message}`);
    }
  }
  
  /**
   * Verifica si ya existe una cabaña con el slug proporcionado
   * @param {string} slug - El slug a verificar
   * @returns {boolean} - Verdadero si ya existe una cabaña con ese slug
   */
  async checkSlugExists(slug) {
    try {
      const response = await notion.databases.query({
        database_id: campaignsDatabaseId,
        filter: {
          property: 'slug',
          rich_text: {
            equals: slug
          }
        }
      });
      
      return response.results.length > 0;
    } catch (error) {
      console.error(`Error al verificar slug ${slug}:`, error);
      throw new Error(`Error al verificar slug: ${error.message}`);
    }
  }

  /**
   * Actualiza el estado de reserva de una cabaña
   */
  async updateCampaignReservation(cabinId, data) {
    try {
      const { teamId, reservationStatus, checkInDate, checkOutDate } = data;
      
      const properties = {};
      
      if (reservationStatus) {
        properties['reservation_status'] = {
          select: {
            name: reservationStatus // "Disponible", "Reservada", "Ocupada", "Finalizada"
          }
        };
      }
      
      if (teamId) {
        properties['team_assigned'] = {
          relation: [{
            id: teamId
          }]
        };
      } else {
        // Si no hay team_id, eliminamos la relación
        properties['team_assigned'] = {
          relation: []
        };
      }
      
      if (checkInDate) {
        properties['check_in_date'] = {
          date: {
            start: checkInDate
          }
        };
      } else {
        properties['check_in_date'] = {
          date: null
        };
      }
      
      if (checkOutDate) {
        properties['check_out_date'] = {
          date: {
            start: checkOutDate
          }
        };
      } else {
        properties['check_out_date'] = {
          date: null
        };
      }

      const response = await notion.pages.update({
        page_id: cabinId,
        properties
      });

      return this.formatCampaign(response);
    } catch (error) {
      console.error(`Error al actualizar la reserva de la cabaña ${cabinId}:`, error);
      throw new Error('Error al actualizar la reserva de la cabaña');
    }
  }

  /**
   * Formatea una sola cabaña
   */
  formatCampaign(page) {
    return this.formatCampaigns([page])[0];
  }

  /**
   * Obtiene el contenido de una página de Notion
   */
  async getPageContent(pageId) {
    try {
      // Obtener los bloques de la página
      const blocks = await notion.blocks.children.list({
        block_id: pageId,
      });

      // Procesar y formatear los bloques
      return this.formatBlocks(blocks.results);
    } catch (error) {
      console.error(`Error al obtener el contenido de la página ${pageId}:`, error);
      return [];
    }
  }

  /**
   * Formatea los bloques de contenido de Notion
   */
  formatBlocks(blocks) {
    return blocks.map(block => {
      // Formateamos según el tipo de bloque
      switch (block.type) {
        case 'paragraph':
          return {
            type: 'paragraph',
            id: block.id,
            text: block.paragraph.rich_text.map(t => t.plain_text).join('')
          };
        case 'heading_1':
          return {
            type: 'heading_1',
            id: block.id,
            text: block.heading_1.rich_text.map(t => t.plain_text).join('')
          };
        case 'heading_2':
          return {
            type: 'heading_2',
            id: block.id,
            text: block.heading_2.rich_text.map(t => t.plain_text).join('')
          };
        case 'heading_3':
          return {
            type: 'heading_3',
            id: block.id,
            text: block.heading_3.rich_text.map(t => t.plain_text).join('')
          };
        case 'bulleted_list_item':
          return {
            type: 'bulleted_list_item',
            id: block.id,
            text: block.bulleted_list_item.rich_text.map(t => t.plain_text).join('')
          };
        case 'numbered_list_item':
          return {
            type: 'numbered_list_item',
            id: block.id,
            text: block.numbered_list_item.rich_text.map(t => t.plain_text).join('')
          };
        case 'to_do':
          return {
            type: 'to_do',
            id: block.id,
            text: block.to_do.rich_text.map(t => t.plain_text).join(''),
            checked: block.to_do.checked
          };
        case 'toggle':
          return {
            type: 'toggle',
            id: block.id,
            text: block.toggle.rich_text.map(t => t.plain_text).join('')
          };
        case 'child_page':
          return {
            type: 'child_page',
            id: block.id,
            title: block.child_page.title
          };
        case 'image':
          return {
            type: 'image',
            id: block.id,
            url: block.image.type === 'external' ? block.image.external.url : block.image.file.url,
            caption: block.image.caption ? block.image.caption.map(t => t.plain_text).join('') : ''
          };
        case 'divider':
          return {
            type: 'divider',
            id: block.id
          };
        case 'quote':
          return {
            type: 'quote',
            id: block.id,
            text: block.quote.rich_text.map(t => t.plain_text).join('')
          };
        case 'code':
          return {
            type: 'code',
            id: block.id,
            text: block.code.rich_text.map(t => t.plain_text).join(''),
            language: block.code.language
          };
        case 'file':
          return {
            type: 'file',
            id: block.id,
            url: block.file.type === 'external' ? block.file.external.url : block.file.file.url,
            name: block.file.caption ? block.file.caption.map(t => t.plain_text).join('') : 'File'
          };
        case 'bookmark':
          return {
            type: 'bookmark',
            id: block.id,
            url: block.bookmark.url,
            caption: block.bookmark.caption ? block.bookmark.caption.map(t => t.plain_text).join('') : ''
          };
        case 'table':
          return {
            type: 'table',
            id: block.id
          };
        default:
          return {
            type: block.type,
            id: block.id,
            unsupported: true
          };
      }
    });
  }

  /**
   * Formatea los datos de una cabaña desde el formato de Notion al formato deseado por la API
   */
  formatCampaigns(pages) {
    return pages.map(page => {
      const properties = page.properties;

      // Obtener el equipo asignado, si existe
      let teamAssigned = null;
      if (properties.team_assigned?.relation && properties.team_assigned.relation.length > 0) {
        teamAssigned = properties.team_assigned.relation[0].id;
      }

      return {
        id: page.id,
        name: properties.Name?.title?.map(title => title.plain_text).join('') || '',
        slug: properties.slug?.rich_text?.map(text => text.plain_text).join('') || '',
        nrBeds: properties.NrBeds?.number || 0,
        category: properties.Category?.select?.name || '',
        amenities: {
          gym: properties.gym?.checkbox || false,
          skiroom: properties.skiroom?.checkbox || false,
          food: properties.food?.checkbox || false,
        },
        teamAssigned,
        reservationStatus: properties.reservation_status?.select?.name || 'Disponible',
        checkInDate: properties.check_in_date?.date?.start || null,
        checkOutDate: properties.check_out_date?.date?.start || null,
        direction: properties.direction?.rich_text?.map(text => text.plain_text).join('') || '',
        linkMaps: properties.linkMaps?.url || '',
        admin: properties.Admin?.people?.map(person => ({
          id: person.id,
          name: person.name,
          avatarUrl: person.avatar_url,
        })) || [],
        banner: properties.banner?.url || '',
        lastEditedTime: page.last_edited_time
      };
    });
  }
}

module.exports = new CampaignService();