const { notion } = require("../config/notion");
const { cacheService } = require("../config/cache");
const campaignService = require("../services/campaignService");
const serviceResolver = require("./serviceResolver");

class HorariosService {
    constructor() {
        this.databaseId = process.env.NOTION_HORARIOS_DATABASE_ID;
      }

  async getAllHorarios() {
    try {
      const response = await notion.databases.query({
        database_id: this.databaseId,
        sorts: [
          {
            property: "Check-in",
            direction: "ascending",
          },
        ],
      });

      return this.formatHorarios(response.results);
    } catch (error) {
      console.error("Error al obtener horarios:", error);
      throw new Error("Error al consultar la base de datos de Horarios");
    }
  }

  async getHorarioById(horarioId) {
    try {
      const response = await notion.pages.retrieve({
        page_id: horarioId,
      });

      return this.formatHorario(response);
    } catch (error) {
      console.error(`Error al obtener horario con ID ${horarioId}:`, error);
      throw new Error(`Error al buscar horario con ID: ${horarioId}`);
    }
  }

  async getHorariosByCabana(cabanaId) {
    try {
      const response = await notion.databases.query({
        database_id: this.databaseId,
        filter: {
          property: "Cabañas",
          relation: {
            contains: cabanaId,
          },
        },
        sorts: [
          {
            property: "Check-in",
            direction: "ascending",
          },
        ],
      });

      return this.formatHorarios(response.results);
    } catch (error) {
      console.error(
        `Error al obtener horarios para la cabaña ${cabanaId}:`,
        error
      );
      throw new Error("Error al consultar horarios para este alojamiento");
    }
  }
  async getHorariosByEquipo(equipoId) {
    try {
      // Intentar obtener desde caché
      const cacheKey = `horarios:equipo:${equipoId}`;
      const cachedHorarios = await cacheService.get(cacheKey);
      if (cachedHorarios) {
        return cachedHorarios;
      }

      // Función para consultar a Notion con reintentos manualmente
      const fetchFromNotion = async () => {
        // Implementación manual de reintentos
        let lastError;
        for (let attempt = 1; attempt <= 5; attempt++) {
          try {
            return await notion.databases.query({
              database_id: this.databaseId,
              filter: {
                property: "Equipo",
                relation: {
                  contains: equipoId,
                },
              },
              sorts: [
                {
                  property: "Check-in",
                  direction: "ascending",
                },
              ],
            });
          } catch (error) {
            lastError = error;
            if (error.code === "rate_limited") {
              const waitTime = Math.min(Math.pow(2, attempt) * 500, 30000);
              console.warn(
                `Rate limited. Esperando ${
                  waitTime / 1000
                }s antes de reintentar...`
              );
              await new Promise((resolve) => setTimeout(resolve, waitTime));
            } else {
              await new Promise((resolve) => setTimeout(resolve, 500));
              if (attempt === 5) throw error;
            }
          }
        }
        throw lastError;
      };

      const response = await fetchFromNotion();
      const horarios = this.formatHorarios(response.results);

      // Guardar en caché por 5 minutos
      await cacheService.set(cacheKey, horarios, 300);

      return horarios;
    } catch (error) {
      console.error(`Error al obtener horarios para el equipo ${equipoId}:`, error);
      throw new Error("Error al consultar horarios para este equipo"); // Este es el mensaje de error que estás viendo
    }
  }

  async getActiveHorarios() {
    const currentDate = new Date().toISOString().split("T")[0];

    try {
      const response = await notion.databases.query({
        database_id: this.databaseId,
        filter: {
          and: [
            {
              property: "Check-in",
              date: {
                on_or_before: currentDate,
              },
            },
            {
              property: "Check-out",
              date: {
                on_or_after: currentDate,
              },
            },
            {
                property: "Estado",
                select: {
                  does_not_equal: "Disponible",
                },
              }
              
          ],
        },
        sorts: [
          {
            property: "Check-in",
            direction: "ascending",
          },
        ],
      });

      return this.formatHorarios(response.results);
    } catch (error) {
      console.error("Error al obtener horarios activos:", error);
      throw new Error("Error al consultar horarios activos");
    }
  }

  async getFutureHorarios() {
    const currentDate = new Date().toISOString().split("T")[0];

    try {
      const response = await notion.databases.query({
        database_id: this.databaseId,
        filter: {
          and: [
            {
              property: "Check-in",
              date: {
                after: currentDate,
              },
            },
            {
              property: "Estado",
              select: {
                equals: "Confirmada",
              },
            },
          ],
        },
        sorts: [
          {
            property: "Check-in",
            direction: "ascending",
          },
        ],
      });

      return this.formatHorarios(response.results);
    } catch (error) {
      console.error("Error al obtener horarios futuros:", error);
      throw new Error("Error al consultar horarios futuros");
    }
  }
  // En horariosService.js, modifica el método checkCabanaAvailability
  async checkCabanaAvailability(cabanaId, checkInDate, checkOutDate, numBeds = 1) {
    try {
      // Validar parámetros recibidos
      if (!cabanaId) {
        throw new Error('ID de cabaña no proporcionado');
      }
      
      if (!checkInDate || !checkOutDate) {
        throw new Error('Fechas de check-in y check-out son obligatorias');
      }
      
      // Get campaignService here, after full initialization
      const campaignService = require('../services/campaignService');
      
      // Obtener el tipo de alojamiento con manejo de errores
      let campaign;
      try {
        campaign = await campaignService.getCampaignById(cabanaId);
      } catch (error) {
        console.error(`Error al obtener información de cabaña ${cabanaId}:`, error);
        throw new Error(`No se pudo obtener información del alojamiento: ${error.message}`);
      }
      
      if (!campaign) {
        throw new Error(`No se encontró alojamiento con ID: ${cabanaId}`);
      }
      
      const isHostal = campaign.accommodationType === 'Hostal';
  
      // Verificar disponibilidad según tipo de alojamiento
      if (isHostal) {
        return await this.checkHostalAvailability(cabanaId, checkInDate, checkOutDate, numBeds, campaign.totalCapacity);
      } else {
        return await this.checkCabinAvailability(cabanaId, checkInDate, checkOutDate);
      }
    } catch (error) {
      console.error('Error detallado al verificar disponibilidad:', error);
      // Re-lanzar el error con un mensaje más específico
      throw new Error(`Error al verificar disponibilidad: ${error.message}`);
    }
  }


  async checkCabinAvailability(cabanaId, checkInDate, checkOutDate) {
    try {
        console.log("🔎 Verificando disponibilidad...");
        console.log("🏡 Cabana ID:", cabanaId);
        console.log("📅 Check-in:", checkInDate);
        console.log("📅 Check-out:", checkOutDate);

        if (!cabanaId) throw new Error("❌ Error: El ID de la cabaña no puede estar vacío.");
        if (!checkInDate || !checkOutDate) throw new Error("❌ Error: Las fechas son obligatorias.");

        // Enfoque alternativo: usar tres consultas separadas para cada caso de superposición
        // y luego combinar los resultados
        const firstQuery = await notion.databases.query({
            database_id: this.databaseId,
            filter: {
                and: [
                    { property: "Cabañas", relation: { contains: cabanaId } },
                    { property: "Estado", select: { does_not_equal: "Disponible" } },
                    { property: "Check-in", date: { on_or_before: checkInDate } },
                    { property: "Check-out", date: { on_or_after: checkInDate } }
                ]
            }
        });

        const secondQuery = await notion.databases.query({
            database_id: this.databaseId,
            filter: {
                and: [
                    { property: "Cabañas", relation: { contains: cabanaId } },
                    { property: "Estado", select: { does_not_equal: "Disponible" } },
                    { property: "Check-in", date: { on_or_before: checkOutDate } },
                    { property: "Check-out", date: { on_or_after: checkOutDate } }
                ]
            }
        });

        const thirdQuery = await notion.databases.query({
            database_id: this.databaseId,
            filter: {
                and: [
                    { property: "Cabañas", relation: { contains: cabanaId } },
                    { property: "Estado", select: { does_not_equal: "Disponible" } },
                    { property: "Check-in", date: { on_or_after: checkInDate } },
                    { property: "Check-out", date: { on_or_before: checkOutDate } }
                ]
            }
        });

        // Combinar resultados (eliminar duplicados)
        const allResults = [...firstQuery.results, ...secondQuery.results, ...thirdQuery.results];
        const uniqueIds = new Set();
        const conflictingReservations = allResults.filter(result => {
            if (uniqueIds.has(result.id)) return false;
            uniqueIds.add(result.id);
            return true;
        });

        console.log("✅ Respuesta de Notion:", conflictingReservations.length, "reservas encontradas");

        return {
            isAvailable: conflictingReservations.length === 0,
            conflictingReservations: conflictingReservations,
        };
    } catch (error) {
        console.error("❌ Error al verificar disponibilidad de la cabaña:", error.message);
        throw new Error("Error al verificar disponibilidad: " + error.message);
    }
}



async checkHostalAvailability(
    hostalId,
    checkInDate,
    checkOutDate,
    requestedBeds,
    totalCapacity
  ) {
    try {
      // Consulta 1: Reservas que incluyen la fecha de check-in
      const query1 = await notion.databases.query({
        database_id: this.databaseId,
        filter: {
          and: [
            {
              property: "Cabañas",
              relation: {
                contains: hostalId,
              },
            },
            {
              property: "Estado",
              select: {
                equals: "Confirmada",
              },
            },
            {
              property: "Check-in",
              date: {
                on_or_before: checkInDate,
              },
            },
            {
              property: "Check-out",
              date: {
                on_or_after: checkInDate,
              },
            },
          ],
        },
      });
  
      // Consulta 2: Reservas que incluyen la fecha de check-out
      const query2 = await notion.databases.query({
        database_id: this.databaseId,
        filter: {
          and: [
            {
              property: "Cabañas",
              relation: {
                contains: hostalId,
              },
            },
            {
              property: "Estado",
              select: {
                equals: "Confirmada",
              },
            },
            {
              property: "Check-in",
              date: {
                on_or_before: checkOutDate,
              },
            },
            {
              property: "Check-out",
              date: {
                on_or_after: checkOutDate,
              },
            },
          ],
        },
      });
  
      // Consulta 3: Reservas completamente dentro del período
      const query3 = await notion.databases.query({
        database_id: this.databaseId,
        filter: {
          and: [
            {
              property: "Cabañas",
              relation: {
                contains: hostalId,
              },
            },
            {
              property: "Estado",
              select: {
                equals: "Confirmada",
              },
            },
            {
              property: "Check-in",
              date: {
                on_or_after: checkInDate,
              },
            },
            {
              property: "Check-out",
              date: {
                on_or_before: checkOutDate,
              },
            },
          ],
        },
      });
  
      // Combinar resultados y eliminar duplicados
      const allResults = [...query1.results, ...query2.results, ...query3.results];
      const uniqueIds = new Set();
      const conflictingReservations = allResults.filter(result => {
        if (uniqueIds.has(result.id)) return false;
        uniqueIds.add(result.id);
        return true;
      });
  
      // Calcular camas ocupadas
      let occupiedBeds = 0;
      const formattedReservations = this.formatHorarios(conflictingReservations);
  
      for (const reservation of formattedReservations) {
        occupiedBeds += reservation.numBeds || 1;
      }
  
      const availableBeds = totalCapacity - occupiedBeds;
      const isAvailable = availableBeds >= requestedBeds;
  
      return {
        isAvailable,
        conflictingReservations: formattedReservations,
        availableBeds,
        totalCapacity,
        requestedBeds,
      };
    } catch (error) {
      console.error("Error al verificar disponibilidad del hostal:", error);
      throw new Error("Error al verificar disponibilidad del hostal");
    }
  }

  async createHorario(horarioData) {
    try {
      const {
        cabanaId,
        equipoId,
        checkInDate,
        checkOutDate,
        precioTotal,
        numBeds = 1,
      } = horarioData;
  
      if (!cabanaId || !checkInDate || !checkOutDate) {
        throw new Error(
          "La cabaña y las fechas de check-in y check-out son obligatorias"
        );
      }
  
      const campaignService = serviceResolver.getService('campaignService');
      
      const campaign = await campaignService.getCampaignById(cabanaId);
      const isHostal = campaign.accommodationType === "Hostal";
  
      const availability = await this.checkCabanaAvailability(
        cabanaId,
        checkInDate,
        checkOutDate,
        isHostal ? numBeds : 1
      );
  
      if (!availability.isAvailable) {
        if (isHostal) {
          throw new Error(
            `No hay suficientes camas disponibles. Solo hay ${availability.availableBeds} camas disponibles.`
          );
        } else {
          throw new Error(
            "La cabaña no está disponible para las fechas seleccionadas"
          );
        }
      }
  
      const properties = {
        "Cabañas": {
          relation: [
            {
              id: cabanaId,
            },
          ],
        },
        "Check-in": {
          date: {
            start: checkInDate,
          },
        },
        "Check-out": {
          date: {
            start: checkOutDate,
          },
        },
        "Estado": {
          select: {
            name: "Pendiente",
          },
        },
      };
  
      if (equipoId) {
        properties["ReservadoPor"] = {
          relation: [
            {
              id: equipoId,
            },
          ],
        };
      }
  
      if (isHostal && numBeds > 0) {
        properties["NumBeds"] = {
          number: parseInt(numBeds),
        };
        
        // Calcular camas disponibles
        const availableBeds = availability.availableBeds - numBeds;
        properties["availableBeds"] = {
          number: Math.max(0, availableBeds),
        };
      }
  
      if (precioTotal !== undefined && precioTotal !== null) {
        properties["precioTotal"] = {
          number: parseFloat(precioTotal),
        };
      }
  
      const response = await notion.pages.create({
        parent: {
          database_id: this.databaseId,
        },
        properties,
      });
  
      const createdHorario = this.formatHorario(response);
  
      await campaignService.invalidateCache(cabanaId);
  
      return createdHorario;
    } catch (error) {
      console.error("Error al crear horario:", error);
      throw new Error(`Error al crear horario: ${error.message}`);
    }
  }
  // Método para confirmar una reserva pendiente
  async confirmHorario(horarioId) {
    try {
      const horario = await this.getHorarioById(horarioId);
  
      if (!horario) {
        throw new Error("No se encontró la reserva");
      }
  
      if (horario.estado === "Confirmada") {
        return horario; // Ya está confirmada
      }
  
      // Verificar que sigue siendo posible confirmar esta reserva
      if (horario.cabana) {
        // Usar el serviceResolver para obtener campaignService
        const campaignService = require('./serviceResolver').getService('campaignService');
        
        const campaign = await campaignService.getCampaignById(horario.cabana);
        const isHostal = campaign.accommodationType === "Hostal";
  
        if (isHostal) {
          // Para hostales, verificar que aún hay camas disponibles suficientes
          // Obtener todas las reservas confirmadas que se solapan con el periodo solicitado
          const response = await notion.databases.query({
            database_id: this.databaseId,
            filter: {
              and: [
                {
                  property: "Cabañas",
                  relation: {
                    contains: horario.cabana,
                  },
                },
                {
                  property: "Estado",
                  select: {
                    equals: "Confirmada",
                  },
                },
                {
                  or: [
                    {
                      and: [
                        {
                          property: "Check-in",
                          date: {
                            on_or_before: horario.checkInDate,
                          },
                        },
                        {
                          property: "Check-out",
                          date: {
                            on_or_after: horario.checkInDate,
                          },
                        },
                      ],
                    },
                    {
                      and: [
                        {
                          property: "Check-in",
                          date: {
                            on_or_before: horario.checkOutDate,
                          },
                        },
                        {
                          property: "Check-out",
                          date: {
                            on_or_after: horario.checkOutDate,
                          },
                        },
                      ],
                    },
                    {
                      and: [
                        {
                          property: "Check-in",
                          date: {
                            on_or_after: horario.checkInDate,
                          },
                        },
                        {
                          property: "Check-out",
                          date: {
                            on_or_before: horario.checkOutDate,
                          },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          });
  
          // Calcular camas ocupadas excluyendo la reserva actual
          let occupiedBeds = 0;
          const conflictingReservations = this.formatHorarios(response.results);
  
          for (const reservation of conflictingReservations) {
            // Excluir la reserva actual del cálculo
            if (reservation.id !== horarioId) {
              occupiedBeds += reservation.numBeds || 1;
            }
          }
  
          // Verificar si hay suficientes camas disponibles
          const availableBeds = campaign.totalCapacity - occupiedBeds;
          if (availableBeds < (horario.numBeds || 1)) {
            throw new Error(
              `No hay suficientes camas disponibles para confirmar la reserva. Solo hay ${availableBeds} camas disponibles.`
            );
          }
        } else {
          // Para cabañas, verificar que no hay reservas confirmadas en el mismo periodo
          const availability = await this.checkCabinAvailability(
            horario.cabana,
            horario.checkInDate,
            horario.checkOutDate
          );
  
          // Filtrar para excluir la reserva actual
          const conflictsExcludingCurrent =
            availability.conflictingReservations.filter(
              (res) => res.id !== horarioId
            );
  
          if (conflictsExcludingCurrent.length > 0) {
            throw new Error(
              "La cabaña ya no está disponible para las fechas seleccionadas"
            );
          }
        }
      }
  
      // Actualizar el estado a Confirmada
      const response = await notion.pages.update({
        page_id: horarioId,
        properties: {
          Estado: {
            select: {
              name: "Confirmada",
            },
          },
        },
      });
  
      const updatedHorario = this.formatHorario(response);
  
      // Invalidar caché
      if (horario.cabana) {
        // Usar serviceResolver para obtener campaignService
        const campaignService = require('./serviceResolver').getService('campaignService');
        await campaignService.invalidateCache(horario.cabana);
      }
  
      return updatedHorario;
    } catch (error) {
      console.error(`Error al confirmar horario ${horarioId}:`, error);
      throw new Error(`Error al confirmar la reserva: ${error.message}`);
    }
  }

  async updateHorario(horarioId, updateData) {
    try {
      const {
        cabanaId,
        equipoId,
        checkInDate,
        checkOutDate,
        precioTotal,
        numBeds,
        estado,
      } = updateData;

      // Obtener la reserva actual para ver qué cambios se realizarán
      const currentHorario = await this.getHorarioById(horarioId);

      const properties = {};

      // Si cambia cabanaId o fechas, verificar disponibilidad
      if (
        (cabanaId && cabanaId !== currentHorario.cabana) ||
        (checkInDate && checkInDate !== currentHorario.checkInDate) ||
        (checkOutDate && checkOutDate !== currentHorario.checkOutDate) ||
        (numBeds && numBeds !== currentHorario.numBeds)
      ) {
        const targetCabanaId = cabanaId || currentHorario.cabana;
        const targetCheckInDate = checkInDate || currentHorario.checkInDate;
        const targetCheckOutDate = checkOutDate || currentHorario.checkOutDate;
        const targetNumBeds = numBeds || currentHorario.numBeds || 1;

        // Obtener información sobre el alojamiento
        const campaign = await campaignService.getCampaignById(targetCabanaId);
        const isHostal = campaign.accommodationType === "Hostal";

        // Verificar disponibilidad
        const availability = await this.checkCabanaAvailability(
          targetCabanaId,
          targetCheckInDate,
          targetCheckOutDate,
          isHostal ? targetNumBeds : 1
        );

        // Si no está disponible y no es la misma reserva (ignoramos nuestra propia reserva)
        if (
          !availability.isAvailable &&
          availability.conflictingReservations.every(
            (res) => res.id !== horarioId
          )
        ) {
          if (isHostal) {
            throw new Error(
              `No hay suficientes camas disponibles. Solo hay ${availability.availableBeds} camas disponibles.`
            );
          } else {
            throw new Error(
              "La cabaña no está disponible para las fechas seleccionadas"
            );
          }
        }
      }

      // Actualizar los campos solicitados
      if (cabanaId) {
        properties["Cabañas"] = {
          relation: [
            {
              id: cabanaId,
            },
          ],
        };
      }

      if (equipoId) {
        properties["Equipo"] = {
          relation: [
            {
              id: equipoId,
            },
          ],
        };
      } else if (equipoId === null) {
        properties["Equipo"] = {
          relation: [],
        };
      }

      if (checkInDate) {
        properties["Check-in"] = {
          date: {
            start: checkInDate,
          },
        };
      }

      if (checkOutDate) {
        properties["Check-out"] = {
          date: {
            start: checkOutDate,
          },
        };
      }

      if (precioTotal !== undefined) {
        properties["precioTotal"] = {
          number: precioTotal,
        };
      }

      if (numBeds !== undefined) {
        properties["NumBeds"] = {
          number: numBeds,
        };
      }

      if (estado) {
        properties["Estado"] = {
          select: {
            name: estado,
          },
        };
      }

      const response = await notion.pages.update({
        page_id: horarioId,
        properties,
      });

      const updatedHorario = this.formatHorario(response);

      // Invalidar caché para cabaña anterior y nueva, si es diferente
      if (currentHorario.cabana) {
        await campaignService.invalidateCache(currentHorario.cabana);
      }
      if (cabanaId && cabanaId !== currentHorario.cabana) {
        await campaignService.invalidateCache(cabanaId);
      }

      return updatedHorario;
    } catch (error) {
      console.error(`Error al actualizar horario ${horarioId}:`, error);
      throw new Error(`Error al actualizar horario: ${error.message}`);
    }
  }

  async deleteHorario(horarioId) {
    try {
      // Primero obtenemos el horario para conocer la cabaña afectada
      const horario = await this.getHorarioById(horarioId);
      const cabanaId = horario.cabana;
  
      // Archivar la página en Notion
      await notion.pages.update({
        page_id: horarioId,
        archived: true,
        properties: {
          'Estado': {
            select: {
              name: 'Cancelada'
            }
          }
        }
      });
  
      // Usar serviceResolver para evitar dependencia circular
      const campaignService = require('./serviceResolver').getService('campaignService');
      
      // Invalidar caché después de cancelar
      if (cabanaId && campaignService && typeof campaignService.invalidateCache === 'function') {
        await campaignService.invalidateCache(cabanaId);
      } else {
        console.warn(`No se pudo invalidar la caché para cabaña ${cabanaId}`);
      }
  
      return { success: true, message: 'Horario eliminado correctamente' };
    } catch (error) {
      console.error(`Error al eliminar horario ${horarioId}:`, error);
      throw new Error('Error al eliminar horario');
    }
  }

  // Método para limpiar reservas pendientes expiradas
  async cleanExpiredPendingReservations() {
    try {
      const expirationHours = 24; // Expiración en horas para reservas pendientes

      // Calcular fecha límite: hace expirationHours horas
      const expirationDate = new Date();
      expirationDate.setHours(expirationDate.getHours() - expirationHours);
      const expirationDateString = expirationDate.toISOString();

      // Obtener todas las reservas pendientes antiguas
      const response = await notion.databases.query({
        database_id: this.databaseId,
        filter: {
          and: [
            {
              property: "Estado",
              select: {
                equals: "Pendiente",
              },
            },
            {
              property: "last_edited_time",
              date: {
                before: expirationDateString,
              },
            },
          ],
        },
      });

      // Cancelar cada reserva expirada
      const cabanaIds = new Set(); // Para rastrear qué cabañas necesitan actualizar caché
      for (const reservation of response.results) {
        const horarioId = reservation.id;

        // Obtener la cabana antes de cancelar
        const cabanaRelation = reservation.properties.Cabañas?.relation || [];
        if (cabanaRelation.length > 0) {
          cabanaIds.add(cabanaRelation[0].id);
        }

        // Archivar la reserva
        await notion.pages.update({
          page_id: horarioId,
          archived: true,
          properties: {
            Estado: {
              select: {
                name: "Cancelada por expiración",
              },
            },
          },
        });
      }

      // Invalidar caché para todas las cabañas afectadas
      for (const cabanaId of cabanaIds) {
        await campaignService.invalidateCache(cabanaId);
      }

      return {
        success: true,
        message: `Se limpiaron ${response.results.length} reservas pendientes expiradas`,
      };
    } catch (error) {
      console.error("Error al limpiar reservas expiradas:", error);
      throw new Error("Error al limpiar reservas pendientes expiradas");
    }
  }

  formatHorario(page) {
    return this.formatHorarios([page])[0];
  }

  formatHorarios(pages) {
    return pages.map((page) => {
      const properties = page.properties;
  
      let cabana = null;
      if (
        properties["Cabañas"]?.relation &&
        properties["Cabañas"].relation.length > 0
      ) {
        cabana = properties["Cabañas"].relation[0].id;
      }
  
      let equipo = null;
      if (
        properties["ReservadoPor"]?.relation &&
        properties["ReservadoPor"].relation.length > 0
      ) {
        equipo = properties["ReservadoPor"].relation[0].id;
      } else if (
        properties["Equipo"]?.relation &&
        properties["Equipo"].relation.length > 0
      ) {
        equipo = properties["Equipo"].relation[0].id;
      }
  
      return {
        id: page.id,
        cabana,
        equipo,
        checkInDate: properties["Check-in"]?.date?.start || null,
        checkOutDate: properties["Check-out"]?.date?.start || null,
        precioTotal: properties["precioTotal"]?.number || 0,
        numBeds: properties["NumBeds"]?.number || 1,
        availableBeds: properties["availableBeds"]?.number || 0,
        estado: properties["Estado"]?.select?.name || "Pendiente",
        lastEdited: page.last_edited_time,
      };
    });
  }
}

// Dentro de horariosService.js, agrega esto después de los imports
// Función para reintento con backoff exponencial
const retry = async (operation, maxRetries = 5, delay = 500) => {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (error.code === "rate_limited") {
        const waitTime = delay * Math.pow(2, attempt - 1);
        console.warn(
          `Intento ${attempt} fallido por rate limit. Esperando ${waitTime}ms`
        );
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      } else {
        console.warn(`Intento ${attempt} fallido:`, error.message);
        if (attempt === maxRetries) throw lastError;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
};

// Convertir promesas en versión con reintentos
const withRetry =
  (fn) =>
  (...args) =>
    retry(() => fn(...args));

module.exports = new HorariosService();

const horariosServiceInstance = new HorariosService();
serviceResolver.registerService("horariosService", horariosServiceInstance);

module.exports = horariosServiceInstance;
