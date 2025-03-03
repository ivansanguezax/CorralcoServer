const { notion, databaseId } = require('../config/notion');

/**
 * Servicio para interactuar con la API de Notion
 */
class NotionService {
  /**
   * Obtiene todos los equipos de la base de datos de Notion
   */
  async getAllTeams() {
    try {
      const response = await notion.databases.query({
        database_id: databaseId,
        sorts: [
          {
            property: 'TeamName',
            direction: 'ascending',
          },
        ],
      });

      return this.formatTeams(response.results);
    } catch (error) {
      console.error('Error al obtener equipos de Notion:', error);
      throw new Error('Error al consultar la base de datos de Notion');
    }
  }

  /**
   * Obtiene un equipo por su ID
   */
  async getTeamById(teamId) {
    try {
      const response = await notion.pages.retrieve({
        page_id: teamId
      });
      
      return this.formatTeam(response);
    } catch (error) {
      console.error(`Error al obtener equipo con ID ${teamId}:`, error);
      throw new Error(`Error al buscar equipo con ID: ${teamId}`);
    }
  }

  /**
   * Obtiene un equipo específico por su slug
   */
  async getTeamBySlug(slug) {
    try {
      const response = await notion.databases.query({
        database_id: databaseId,
        filter: {
          property: 'Slug',
          rich_text: {
            equals: slug,
          },
        },
      });

      if (response.results.length === 0) {
        throw new Error(`No se encontró ningún equipo con el slug: ${slug}`);
      }
      
      // Obtenemos el ID de la página para luego obtener su contenido
      const pageId = response.results[0].id;
      
      // Obtenemos el contenido de la página
      const pageContent = await this.getPageContent(pageId);
      
      // Obtenemos las propiedades formateadas
      const teamData = this.formatTeams(response.results)[0];
      
      // Retornamos un objeto que contiene tanto las propiedades como el contenido
      return {
        ...teamData,
        pageContent: pageContent
      };
    } catch (error) {
      console.error(`Error al obtener equipo con slug ${slug}:`, error);
      throw new Error(`Error al buscar equipo con slug: ${slug}`);
    }
  }


  /**
 * Crea un nuevo equipo en la base de datos de Notion
 * @param {Object} teamData - Datos del equipo a crear
 * @returns {Object} El equipo creado y formateado
 */
async createTeam(teamData) {
  try {
    const { 
      teamName, 
      country, 
      level, 
      athleteCount, 
      sport, 
      dateIn, 
      dateOut, 
      slug, 
      competitionStatus 
    } = teamData;
    
    // Validar campos requeridos
    if (!teamName || !slug) {
      throw new Error('El nombre del equipo y el slug son obligatorios');
    }
    
    // Verificar si el slug ya existe
    const existingTeam = await this.checkSlugExists(slug);
    if (existingTeam) {
      throw new Error(`Ya existe un equipo con el slug: ${slug}`);
    }
    
    // Preparar las propiedades para la creación
    const properties = {
      'TeamName': {
        title: [
          {
            text: {
              content: teamName
            }
          }
        ]
      },
      'Slug': {
        rich_text: [
          {
            text: {
              content: slug
            }
          }
        ]
      }
    };
    
    // Agregar propiedades opcionales si están presentes
    if (country) {
      properties['Country'] = {
        rich_text: [
          {
            text: {
              content: country
            }
          }
        ]
      };
    }
    
    if (level) {
      properties['Level'] = {
        select: {
          name: level
        }
      };
    }
    
    if (athleteCount !== undefined) {
      properties['athleteCount'] = {
        number: athleteCount
      };
    }
    
    if (sport) {
      properties['Sport'] = {
        select: {
          name: sport
        }
      };
    }
    
    if (dateIn) {
      properties['DateIn'] = {
        date: {
          start: dateIn
        }
      };
    }
    
    if (dateOut) {
      properties['DateOut'] = {
        date: {
          start: dateOut
        }
      };
    }
    
    if (competitionStatus) {
      properties['CompetitionStatus'] = {
        select: {
          name: competitionStatus
        }
      };
    }
    
    // Crear la página en Notion
    const response = await notion.pages.create({
      parent: {
        database_id: databaseId
      },
      properties
    });
    
    return this.formatTeam(response);
  } catch (error) {
    console.error('Error al crear equipo en Notion:', error);
    throw new Error(`Error al crear equipo: ${error.message}`);
  }
}

/**
 * Verifica si ya existe un equipo con el slug proporcionado
 * @param {string} slug - El slug a verificar
 * @returns {boolean} - Verdadero si ya existe un equipo con ese slug
 */
async checkSlugExists(slug) {
  try {
    const response = await notion.databases.query({
      database_id: databaseId,
      filter: {
        property: 'Slug',
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
   * Actualiza la reserva de un equipo
   */
  async updateTeamReservation(teamId, data) {
    try {
      const { cabinId, reservationStart, reservationEnd } = data;
      
      const properties = {};
      
      if (cabinId) {
        properties['cabin_reserved'] = {
          relation: [{
            id: cabinId
          }]
        };
      } else {
        // Si no hay cabin_id, eliminamos la relación
        properties['cabin_reserved'] = {
          relation: []
        };
      }
      
      if (reservationStart) {
        properties['reservation_start'] = {
          date: {
            start: reservationStart
          }
        };
      } else {
        properties['reservation_start'] = {
          date: null
        };
      }
      
      if (reservationEnd) {
        properties['reservation_end'] = {
          date: {
            start: reservationEnd
          }
        };
      } else {
        properties['reservation_end'] = {
          date: null
        };
      }

      const response = await notion.pages.update({
        page_id: teamId,
        properties
      });

      return this.formatTeam(response);
    } catch (error) {
      console.error(`Error al actualizar reserva del equipo ${teamId}:`, error);
      throw new Error('Error al actualizar la reserva del equipo');
    }
  }

  /**
   * Formatea un solo equipo
   */
  formatTeam(page) {
    return this.formatTeams([page])[0];
  }
  
  /**
   * Obtiene el contenido de una página de Notion
   */
  async getPageContent(pageId) {
    try {
      // Obtener los bloques de contenido de la página
      const blocks = await notion.blocks.children.list({
        block_id: pageId,
      });
      
      // Para bloques con hijos, obtener también su contenido
      const contentWithChildren = await this.processBlocksWithChildren(blocks.results);
      
      return contentWithChildren;
    } catch (error) {
      console.error(`Error al obtener contenido de la página ${pageId}:`, error);
      return "Error al obtener contenido de la página";
    }
  }
  
  /**
   * Procesa bloques y obtiene hijos si es necesario
   */
  async processBlocksWithChildren(blocks) {
    // Primero extraemos todos los bloques
    const content = this.extractContentFromBlocks(blocks);
    
    // Luego procesamos bloques con hijos (has_children: true)
    for (let i = 0; i < content.length; i++) {
      if (content[i].has_children) {
        try {
          // Obtener bloques hijos
          const childrenBlocks = await notion.blocks.children.list({
            block_id: content[i].id,
          });
          
          // Procesar recursivamente los bloques hijos
          content[i].children = await this.processBlocksWithChildren(childrenBlocks.results);
        } catch (error) {
          console.error(`Error al obtener bloques hijos para ${content[i].id}:`, error);
          content[i].children = [{
            type: 'error',
            message: 'Error al obtener bloques hijos'
          }];
        }
      }
    }
    
    return content;
  }
  
  /**
   * Extrae el contenido de texto de los bloques de Notion
   */
  extractContentFromBlocks(blocks) {
    const content = [];
    
    for (const block of blocks) {
      try {
        // Propiedades comunes para todos los bloques
        const blockData = {
          id: block.id,
          type: block.type,
          has_children: block.has_children
        };

        // Extraer texto según el tipo de bloque
        switch(block.type) {
          case 'paragraph':
            content.push({
              ...blockData,
              text: block.paragraph.rich_text.map(text => text.plain_text).join(''),
              annotations: this.extractAnnotations(block.paragraph.rich_text)
            });
            break;
            
          case 'heading_1':
            content.push({
              ...blockData,
              text: block.heading_1.rich_text.map(text => text.plain_text).join(''),
              annotations: this.extractAnnotations(block.heading_1.rich_text)
            });
            break;
            
          case 'heading_2':
            content.push({
              ...blockData,
              text: block.heading_2.rich_text.map(text => text.plain_text).join(''),
              annotations: this.extractAnnotations(block.heading_2.rich_text)
            });
            break;
            
          case 'heading_3':
            content.push({
              ...blockData,
              text: block.heading_3.rich_text.map(text => text.plain_text).join(''),
              annotations: this.extractAnnotations(block.heading_3.rich_text)
            });
            break;
            
          case 'bulleted_list_item':
            content.push({
              ...blockData,
              text: block.bulleted_list_item.rich_text.map(text => text.plain_text).join(''),
              annotations: this.extractAnnotations(block.bulleted_list_item.rich_text)
            });
            break;
            
          case 'numbered_list_item':
            content.push({
              ...blockData,
              text: block.numbered_list_item.rich_text.map(text => text.plain_text).join(''),
              annotations: this.extractAnnotations(block.numbered_list_item.rich_text)
            });
            break;
            
          case 'to_do':
            content.push({
              ...blockData,
              text: block.to_do.rich_text.map(text => text.plain_text).join(''),
              checked: block.to_do.checked,
              annotations: this.extractAnnotations(block.to_do.rich_text)
            });
            break;
            
          case 'toggle':
            content.push({
              ...blockData,
              text: block.toggle.rich_text.map(text => text.plain_text).join(''),
              annotations: this.extractAnnotations(block.toggle.rich_text)
            });
            break;
            
          case 'child_page':
            content.push({
              ...blockData,
              title: block.child_page.title
            });
            break;
            
          case 'child_database':
            content.push({
              ...blockData,
              title: block.child_database.title
            });
            break;
            
          case 'embed':
            content.push({
              ...blockData,
              url: block.embed.url,
              caption: block.embed.caption?.map(text => text.plain_text).join('') || ''
            });
            break;
            
          case 'image':
            content.push({
              ...blockData,
              caption: block.image.caption?.map(text => text.plain_text).join('') || '',
              type: 'image',
              file_type: block.image.type,
              url: block.image.type === 'external' ? block.image.external.url : block.image.file?.url
            });
            break;
            
          case 'video':
            content.push({
              ...blockData,
              caption: block.video.caption?.map(text => text.plain_text).join('') || '',
              type: 'video',
              file_type: block.video.type,
              url: block.video.type === 'external' ? block.video.external.url : block.video.file?.url
            });
            break;
            
          case 'file':
            content.push({
              ...blockData,
              caption: block.file.caption?.map(text => text.plain_text).join('') || '',
              file_type: block.file.type,
              url: block.file.type === 'external' ? block.file.external.url : block.file.file?.url
            });
            break;
            
          case 'pdf':
            content.push({
              ...blockData,
              caption: block.pdf.caption?.map(text => text.plain_text).join('') || '',
              file_type: block.pdf.type,
              url: block.pdf.type === 'external' ? block.pdf.external.url : block.pdf.file?.url
            });
            break;
            
          case 'bookmark':
            content.push({
              ...blockData,
              url: block.bookmark.url,
              caption: block.bookmark.caption?.map(text => text.plain_text).join('') || ''
            });
            break;
            
          case 'callout':
            content.push({
              ...blockData,
              text: block.callout.rich_text.map(text => text.plain_text).join(''),
              icon: block.callout.icon,
              annotations: this.extractAnnotations(block.callout.rich_text)
            });
            break;
            
          case 'quote':
            content.push({
              ...blockData,
              text: block.quote.rich_text.map(text => text.plain_text).join(''),
              annotations: this.extractAnnotations(block.quote.rich_text)
            });
            break;
            
          case 'equation':
            content.push({
              ...blockData,
              expression: block.equation.expression
            });
            break;
            
          case 'divider':
            content.push({
              ...blockData
            });
            break;
            
          case 'table_of_contents':
            content.push({
              ...blockData
            });
            break;
            
          case 'breadcrumb':
            content.push({
              ...blockData
            });
            break;
            
          case 'column_list':
            content.push({
              ...blockData
            });
            break;
            
          case 'column':
            content.push({
              ...blockData
            });
            break;
            
          case 'link_preview':
            content.push({
              ...blockData,
              url: block.link_preview.url
            });
            break;
            
          case 'template':
            content.push({
              ...blockData,
              text: block.template.rich_text.map(text => text.plain_text).join(''),
              annotations: this.extractAnnotations(block.template.rich_text)
            });
            break;
            
          case 'link_to_page':
            content.push({
              ...blockData,
              page_id: block.link_to_page.page_id || block.link_to_page.database_id
            });
            break;
            
          case 'table':
            content.push({
              ...blockData,
              table_width: block.table.table_width,
              has_column_header: block.table.has_column_header,
              has_row_header: block.table.has_row_header
            });
            break;
            
          case 'table_row':
            content.push({
              ...blockData,
              cells: block.table_row.cells.map(cell => ({
                text: cell.map(text => text.plain_text).join(''),
                annotations: this.extractAnnotations(cell)
              }))
            });
            break;
            
          case 'code':
            content.push({
              ...blockData,
              text: block.code.rich_text.map(text => text.plain_text).join(''),
              language: block.code.language,
              caption: block.code.caption?.map(text => text.plain_text).join('') || '',
              annotations: this.extractAnnotations(block.code.rich_text)
            });
            break;
            
          case 'audio':
            content.push({
              ...blockData,
              caption: block.audio.caption?.map(text => text.plain_text).join('') || '',
              file_type: block.audio.type,
              url: block.audio.type === 'external' ? block.audio.external.url : block.audio.file?.url
            });
            break;
            
          case 'unsupported':
            content.push({
              ...blockData,
              description: 'Bloque no soportado por la API de Notion'
            });
            break;
            
          default:
            // Para cualquier tipo de bloque desconocido
            content.push({
              ...blockData,
              raw_content: block[block.type] || {}
            });
        }
        
        // Si el bloque tiene hijos, obtener recursivamente el contenido
        if (block.has_children) {
          // Aquí se podría implementar la obtención de bloques hijos
          // Nota: esto requeriría otra llamada a la API de Notion
        }
      } catch (error) {
        console.error(`Error al procesar bloque de tipo ${block.type}:`, error);
        content.push({
          type: block.type || 'unknown',
          error: 'Error al procesar este bloque',
          id: block.id
        });
      }
    }
    
    return content;
  }
  
  /**
   * Extrae anotaciones (formato) de texto enriquecido
   */
  extractAnnotations(richText) {
    if (!richText || richText.length === 0) return [];
    
    return richText.map(text => {
      if (!text.annotations) return null;
      
      return {
        text: text.plain_text,
        bold: text.annotations.bold,
        italic: text.annotations.italic,
        strikethrough: text.annotations.strikethrough,
        underline: text.annotations.underline,
        code: text.annotations.code,
        color: text.annotations.color,
        link: text.href
      };
    }).filter(anno => anno !== null);
  }

  /**
   * Formatea los resultados de Notion a un formato más limpio
   */
  formatTeams(results) {
    return results.map(page => {
      const properties = page.properties;

      // Obtener la cabaña reservada, si existe
      let cabinReserved = null;
      if (properties.cabin_reserved?.relation && properties.cabin_reserved.relation.length > 0) {
        cabinReserved = properties.cabin_reserved.relation[0].id;
      }

      return {
        id: page.id,
        teamName: properties.TeamName?.title[0]?.plain_text || '',
        country: properties.Country?.rich_text[0]?.plain_text || '',
        level: properties.Level?.select?.name || '',
        athleteCount: properties.athleteCount?.number || 0,
        sport: properties.Sport?.select?.name || '',
        dateIn: properties.DateIn?.date?.start || null,
        dateOut: properties.DateOut?.date?.start || null,
        slug: properties.Slug?.rich_text[0]?.plain_text || '',
        competitionStatus: properties.CompetitionStatus?.select?.name || '',
        cabinReserved,
        reservationStart: properties.reservation_start?.date?.start || null,
        reservationEnd: properties.reservation_end?.date?.start || null,
        lastEdited: page.last_edited_time
      };
    });
  }
}

module.exports = new NotionService();