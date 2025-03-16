const { notion } = require('../config/notion');

class PasajerosService {
  constructor() {
    this.databaseId = process.env.NOTION_PASAJEROS_DATABASE_ID;
  }

  async getAllPasajeros() {
    try {
      const response = await notion.databases.query({
        database_id: this.databaseId,
        sorts: [
          {
            property: 'Nombre',
            direction: 'ascending',
          },
        ],
      });

      return this.formatPasajeros(response.results);
    } catch (error) {
      console.error('Error al obtener pasajeros:', error);
      throw new Error('Error al consultar la base de datos de Pasajeros');
    }
  }

  async getPasajeroById(pasajeroId) {
    try {
      const response = await notion.pages.retrieve({
        page_id: pasajeroId
      });
      
      return this.formatPasajero(response);
    } catch (error) {
      console.error(`Error al obtener pasajero con ID ${pasajeroId}:`, error);
      throw new Error(`Error al buscar pasajero con ID: ${pasajeroId}`);
    }
  }

  async getPasajerosByEquipo(equipoId) {
    try {
      const response = await notion.databases.query({
        database_id: this.databaseId,
        filter: {
          property: 'Equipo',
          relation: {
            contains: equipoId
          }
        },
        sorts: [
          {
            property: 'Nombre',
            direction: 'ascending',
          },
        ],
      });

      return this.formatPasajeros(response.results);
    } catch (error) {
      console.error(`Error al obtener pasajeros para el equipo ${equipoId}:`, error);
      throw new Error('Error al consultar pasajeros para este equipo');
    }
  }

  async createPasajero(pasajeroData) {
    try {
      const { nombre, correo, telefono, equipoId } = pasajeroData;
      
      if (!nombre) {
        throw new Error('El nombre del pasajero es obligatorio');
      }
      
      const properties = {
        'Nombre': {
          title: [
            {
              text: {
                content: nombre
              }
            }
          ]
        }
      };
      
      if (correo) {
        properties['Correo'] = {
          email: correo
        };
      }
      
      if (telefono) {
        properties['telefono'] = {
          phone_number: telefono
        };
      }
      
      if (equipoId) {
        properties['Equipo'] = {
          relation: [
            {
              id: equipoId
            }
          ]
        };
      }
      
      const response = await notion.pages.create({
        parent: {
          database_id: this.databaseId
        },
        properties
      });
      
      return this.formatPasajero(response);
    } catch (error) {
      console.error('Error al crear pasajero:', error);
      throw new Error(`Error al crear pasajero: ${error.message}`);
    }
  }

  async updatePasajero(pasajeroId, updateData) {
    try {
      const { nombre, correo, telefono, equipoId } = updateData;
      
      const properties = {};
      
      if (nombre) {
        properties['Nombre'] = {
          title: [
            {
              text: {
                content: nombre
              }
            }
          ]
        };
      }
      
      if (correo !== undefined) {
        properties['Correo'] = {
          email: correo
        };
      }
      
      if (telefono !== undefined) {
        properties['telefono'] = {
          phone_number: telefono
        };
      }
      
      if (equipoId) {
        properties['Equipo'] = {
          relation: [
            {
              id: equipoId
            }
          ]
        };
      } else if (equipoId === null) {
        properties['Equipo'] = {
          relation: []
        };
      }
      
      const response = await notion.pages.update({
        page_id: pasajeroId,
        properties
      });
      
      return this.formatPasajero(response);
    } catch (error) {
      console.error(`Error al actualizar pasajero ${pasajeroId}:`, error);
      throw new Error(`Error al actualizar pasajero: ${error.message}`);
    }
  }

  async deletePasajero(pasajeroId) {
    try {
      await notion.pages.update({
        page_id: pasajeroId,
        archived: true
      });
      
      return { success: true, message: 'Pasajero eliminado correctamente' };
    } catch (error) {
      console.error(`Error al eliminar pasajero ${pasajeroId}:`, error);
      throw new Error('Error al eliminar pasajero');
    }
  }

  formatPasajero(page) {
    return this.formatPasajeros([page])[0];
  }

  formatPasajeros(pages) {
    return pages.map(page => {
      const properties = page.properties;
      
      let equipo = null;
      if (properties['Equipo']?.relation && properties['Equipo'].relation.length > 0) {
        equipo = properties['Equipo'].relation[0].id;
      }
      
      return {
        id: page.id,
        nombre: properties['Nombre']?.title[0]?.plain_text || '',
        correo: properties['Correo']?.email || '',
        telefono: properties['telefono']?.phone_number || '',
        equipo,
        lastEdited: page.last_edited_time
      };
    });
  }
}

module.exports = new PasajerosService();