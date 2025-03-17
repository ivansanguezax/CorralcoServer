const notionService = require('./notionService');
const campaignService = require('./campaignService');
const horariosService = require('./serviceResolver').getService('horariosService');


class ReservationService {
  async createReservation(teamId, cabinId, checkInDate, checkOutDate, precioTotal, numBeds = 1) {
    try {
      // 1. Verificar que la cabaña esté disponible para las fechas
      // Obtener tipo de alojamiento para determinar si es hostal
      const cabin = await campaignService.getCampaignById(cabinId);
      const isHostal = cabin.accommodationType === 'Hostal';
      
      const availability = await horariosService.checkCabanaAvailability(
        cabinId, 
        checkInDate, 
        checkOutDate,
        isHostal ? numBeds : 1
      );
      
      if (!availability.isAvailable) {
        throw new Error('La cabaña no está disponible para las fechas seleccionadas');
      }
      
      // 2. Verificar que el equipo existe
      const team = await notionService.getTeamById(teamId);
      
      // 4. Crear el registro en la BD de Horarios
      const horario = await horariosService.createHorario({
        cabanaId: cabinId,
        equipoId: teamId,
        checkInDate,
        checkOutDate,
        precioTotal,
        numBeds: isHostal ? numBeds : 1
      });
      
      // 5. Retornar los datos de la reserva
      return {
        id: horario.id,
        teamId,
        teamName: team.teamName,
        cabinId,
        cabinName: cabin.name,
        checkInDate,
        checkOutDate,
        precioTotal: horario.precioTotal,
        numBeds: horario.numBeds,
        availableBeds: horario.availableBeds
      };
    } catch (error) {
      console.error('Error al crear la reserva:', error);
      throw error;
    }
  }
  
  async checkIn(horarioId) {
    try {
      // Verificar que el horario existe y está en fecha
      const horario = await horariosService.getHorarioById(horarioId);
      const currentDate = new Date().toISOString().split('T')[0];
      
      // Verificar que la fecha de check-in coincide con la fecha actual o es anterior
      if (horario.checkInDate > currentDate) {
        throw new Error('No se puede hacer check-in antes de la fecha programada');
      }
      
      // No necesitamos actualizar nada en este caso, podríamos agregar un estado si fuera necesario
      return {
        message: 'Check-in realizado correctamente',
        horarioId: horario.id,
        cabanaId: horario.cabana,
        equipoId: horario.equipo,
        checkInDate: horario.checkInDate,
        checkOutDate: horario.checkOutDate
      };
    } catch (error) {
      console.error('Error al realizar check-in:', error);
      throw error;
    }
  }
  
  async checkOut(horarioId) {
    try {
      // Verificar que el horario existe
      const horario = await horariosService.getHorarioById(horarioId);
      
      // En este caso, podríamos marcar el horario como completado o simplemente dejarlo como está
      // Si necesitamos agregar un estado de finalización, habría que modificar la BD de Horarios
      
      return {
        message: 'Check-out realizado correctamente',
        horarioId: horario.id,
        cabanaId: horario.cabana,
        equipoId: horario.equipo
      };
    } catch (error) {
      console.error('Error al realizar check-out:', error);
      throw error;
    }
  }
  
  async cancelReservation(horarioId) {
    try {
      // Verificar que el horario existe
      const horario = await horariosService.getHorarioById(horarioId);
      
      // Eliminar el registro de Horarios (archivar en Notion)
      await horariosService.deleteHorario(horarioId);
      
      return {
        message: 'Reserva cancelada correctamente',
        horarioId: horario.id,
        cabanaId: horario.cabana,
        equipoId: horario.equipo
      };
    } catch (error) {
      console.error('Error al cancelar la reserva:', error);
      throw error;
    }
  }
  
  async getActiveReservations() {
    try {
      // Obtener todos los horarios activos (en curso)
      const activeHorarios = await horariosService.getActiveHorarios();
      
      // Formatear la respuesta
      const reservations = [];
      
      for (const horario of activeHorarios) {
        try {
          const cabin = await campaignService.getCampaignById(horario.cabana);
          let teamName = '';
          
          if (horario.equipo) {
            const team = await notionService.getTeamById(horario.equipo);
            teamName = team.teamName;
          }
          
          reservations.push({
            id: horario.id,
            cabinId: horario.cabana,
            cabinName: cabin.name,
            teamId: horario.equipo,
            teamName,
            checkInDate: horario.checkInDate,
            checkOutDate: horario.checkOutDate,
            precioTotal: horario.precioTotal,
            status: 'Activa'
          });
        } catch (error) {
          console.error(`Error al procesar horario ${horario.id}:`, error);
        }
      }
      
      return reservations;
    } catch (error) {
      console.error('Error al obtener reservas activas:', error);
      throw error;
    }
  }
  
  async getFutureReservations() {
    try {
      // Obtener todos los horarios futuros
      const futureHorarios = await horariosService.getFutureHorarios();
      
      // Formatear la respuesta
      const reservations = [];
      
      for (const horario of futureHorarios) {
        try {
          const cabin = await campaignService.getCampaignById(horario.cabana);
          let teamName = '';
          
          if (horario.equipo) {
            const team = await notionService.getTeamById(horario.equipo);
            teamName = team.teamName;
          }
          
          reservations.push({
            id: horario.id,
            cabinId: horario.cabana,
            cabinName: cabin.name,
            teamId: horario.equipo,
            teamName,
            checkInDate: horario.checkInDate,
            checkOutDate: horario.checkOutDate,
            precioTotal: horario.precioTotal,
            status: 'Reservada'
          });
        } catch (error) {
          console.error(`Error al procesar horario ${horario.id}:`, error);
        }
      }
      
      return reservations;
    } catch (error) {
      console.error('Error al obtener reservas futuras:', error);
      throw error;
    }
  }
  
  async getAllReservations() {
    try {
      const active = await this.getActiveReservations();
      const future = await this.getFutureReservations();
      
      return [...active, ...future];
    } catch (error) {
      console.error('Error al obtener todas las reservas:', error);
      throw error;
    }
  }

  async confirmReservation(horarioId) {
    try {
      // Confirmar la reserva usando horariosService
      const horario = await horariosService.confirmHorario(horarioId);
      
      return {
        id: horario.id,
        cabanaId: horario.cabana,
        equipoId: horario.equipo,
        checkInDate: horario.checkInDate,
        checkOutDate: horario.checkOutDate,
        precioTotal: horario.precioTotal,
        estado: horario.estado
      };
    } catch (error) {
      console.error('Error al confirmar la reserva:', error);
      throw error;
    }
  }
  
  async getCabinReservations(cabinId) {
    try {
      const horarios = await horariosService.getHorariosByCabana(cabinId);
      
      // Formatear la respuesta
      const reservations = [];
      
      for (const horario of horarios) {
        try {
          let teamName = '';
          
          if (horario.equipo) {
            const team = await notionService.getTeamById(horario.equipo);
            teamName = team.teamName;
          }
          
          const currentDate = new Date().toISOString().split('T')[0];
          let status = 'Finalizada';
          
          if (horario.checkInDate <= currentDate && horario.checkOutDate >= currentDate) {
            status = 'Activa';
          } else if (horario.checkInDate > currentDate) {
            status = 'Reservada';
          }
          
          reservations.push({
            id: horario.id,
            cabinId: horario.cabana,
            teamId: horario.equipo,
            teamName,
            checkInDate: horario.checkInDate,
            checkOutDate: horario.checkOutDate,
            precioTotal: horario.precioTotal,
            status
          });
        } catch (error) {
          console.error(`Error al procesar horario ${horario.id}:`, error);
        }
      }
      
      return reservations;
    } catch (error) {
      console.error(`Error al obtener reservas para la cabaña ${cabinId}:`, error);
      throw error;
    }
  }
  
  async getTeamReservations(teamId) {
    try {
      const horarios = await horariosService.getHorariosByEquipo(teamId);
      
      // Formatear la respuesta
      const reservations = [];
      
      for (const horario of horarios) {
        try {
          const cabin = await campaignService.getCampaignById(horario.cabana);
          
          const currentDate = new Date().toISOString().split('T')[0];
          let status = 'Finalizada';
          
          if (horario.checkInDate <= currentDate && horario.checkOutDate >= currentDate) {
            status = 'Activa';
          } else if (horario.checkInDate > currentDate) {
            status = 'Reservada';
          }
          
          reservations.push({
            id: horario.id,
            cabinId: horario.cabana,
            cabinName: cabin.name,
            teamId: horario.equipo,
            checkInDate: horario.checkInDate,
            checkOutDate: horario.checkOutDate,
            precioTotal: horario.precioTotal,
            status
          });
        } catch (error) {
          console.error(`Error al procesar horario ${horario.id}:`, error);
        }
      }
      
      return reservations;
    } catch (error) {
      console.error(`Error al obtener reservas para el equipo ${teamId}:`, error);
      throw error;
    }
  }
}

module.exports = new ReservationService();
