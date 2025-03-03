const notionService = require('./notionService');
const campaignService = require('./campaignService');

/**
 * Servicio para gestionar las reservas entre equipos y cabañas
 */
class ReservationService {
  /**
   * Crea una nueva reserva
   * @param {string} teamId - ID del equipo
   * @param {string} cabinId - ID de la cabaña
   * @param {string} checkInDate - Fecha de check-in (YYYY-MM-DD)
   * @param {string} checkOutDate - Fecha de check-out (YYYY-MM-DD)
   */
  async createReservation(teamId, cabinId, checkInDate, checkOutDate) {
    try {
      // 1. Verificar que la cabaña esté disponible
      const cabin = await this.verifyCabinAvailability(cabinId);
      
      // 2. Verificar que el equipo no tenga una reserva activa
      const team = await this.verifyTeamAvailability(teamId);
      
      // 3. Actualizar el estado de la cabaña a "Reservada"
      await campaignService.updateCampaignReservation(cabinId, {
        teamId,
        reservationStatus: 'Reservada',
        checkInDate,
        checkOutDate
      });
      
      // 4. Actualizar la reserva en el equipo
      await notionService.updateTeamReservation(teamId, {
        cabinId,
        reservationStart: checkInDate,
        reservationEnd: checkOutDate
      });
      
      // 5. Retornar los datos de la reserva
      return {
        teamId,
        teamName: team.teamName,
        cabinId,
        cabinName: cabin.name,
        checkInDate,
        checkOutDate,
        status: 'Reservada'
      };
    } catch (error) {
      console.error('Error al crear la reserva:', error);
      throw error;
    }
  }
  
  /**
   * Actualiza el estado de una reserva a "Ocupada" (check-in)
   * @param {string} cabinId - ID de la cabaña
   */
  async checkIn(cabinId) {
    try {
      // 1. Verificar que la cabaña esté reservada
      const cabin = await campaignService.getCampaignById(cabinId);
      
      if (cabin.reservationStatus !== 'Reservada') {
        throw new Error(`La cabaña no está en estado 'Reservada', estado actual: ${cabin.reservationStatus}`);
      }
      
      // 2. Actualizar el estado de la cabaña a "Ocupada"
      return await campaignService.updateCampaignReservation(cabinId, {
        reservationStatus: 'Ocupada'
      });
    } catch (error) {
      console.error('Error al realizar check-in:', error);
      throw error;
    }
  }
  
  /**
   * Finaliza una reserva (check-out)
   * @param {string} cabinId - ID de la cabaña
   */
  async checkOut(cabinId) {
    try {
      // 1. Verificar que la cabaña esté ocupada
      const cabin = await campaignService.getCampaignById(cabinId);
      
      if (cabin.reservationStatus !== 'Ocupada' && cabin.reservationStatus !== 'Reservada') {
        throw new Error(`La cabaña no está en estado 'Ocupada' o 'Reservada', estado actual: ${cabin.reservationStatus}`);
      }
      
      // 2. Obtener el ID del equipo asignado
      const teamId = cabin.teamAssigned;
      
      if (!teamId) {
        throw new Error('La cabaña no tiene un equipo asignado');
      }
      
      // 3. Actualizar el estado de la cabaña a "Disponible" y eliminar la relación con el equipo
      await campaignService.updateCampaignReservation(cabinId, {
        teamId: null,
        reservationStatus: 'Disponible',
        checkInDate: null,
        checkOutDate: null
      });
      
      // 4. Actualizar el equipo para eliminar la relación con la cabaña
      await notionService.updateTeamReservation(teamId, {
        cabinId: null,
        reservationStart: null,
        reservationEnd: null
      });
      
      return {
        message: 'Reserva finalizada correctamente',
        cabinId,
        teamId
      };
    } catch (error) {
      console.error('Error al realizar check-out:', error);
      throw error;
    }
  }
  
  /**
   * Cancela una reserva
   * @param {string} cabinId - ID de la cabaña
   */
  async cancelReservation(cabinId) {
    try {
      // Similar a checkOut, pero con mensaje diferente
      // 1. Verificar que la cabaña esté reservada
      const cabin = await campaignService.getCampaignById(cabinId);
      
      if (cabin.reservationStatus !== 'Reservada') {
        throw new Error(`La cabaña no está en estado 'Reservada', estado actual: ${cabin.reservationStatus}`);
      }
      
      // 2. Obtener el ID del equipo asignado
      const teamId = cabin.teamAssigned;
      
      if (!teamId) {
        throw new Error('La cabaña no tiene un equipo asignado');
      }
      
      // 3. Actualizar el estado de la cabaña a "Disponible" y eliminar la relación con el equipo
      await campaignService.updateCampaignReservation(cabinId, {
        teamId: null,
        reservationStatus: 'Disponible',
        checkInDate: null,
        checkOutDate: null
      });
      
      // 4. Actualizar el equipo para eliminar la relación con la cabaña
      await notionService.updateTeamReservation(teamId, {
        cabinId: null,
        reservationStart: null,
        reservationEnd: null
      });
      
      return {
        message: 'Reserva cancelada correctamente',
        cabinId,
        teamId
      };
    } catch (error) {
      console.error('Error al cancelar la reserva:', error);
      throw error;
    }
  }
  
  /**
   * Verifica que una cabaña esté disponible para reservar
   * @param {string} cabinId - ID de la cabaña
   * @returns {Object} Datos de la cabaña
   */
  async verifyCabinAvailability(cabinId) {
    try {
      const cabin = await campaignService.getCampaignById(cabinId);
      
      if (cabin.reservationStatus !== 'Disponible') {
        throw new Error(`La cabaña no está disponible, estado actual: ${cabin.reservationStatus}`);
      }
      
      return cabin;
    } catch (error) {
      console.error('Error al verificar disponibilidad de cabaña:', error);
      throw error;
    }
  }
  
  /**
   * Verifica que un equipo no tenga una reserva activa
   * @param {string} teamId - ID del equipo
   * @returns {Object} Datos del equipo
   */
  async verifyTeamAvailability(teamId) {
    try {
      const team = await notionService.getTeamById(teamId);
      
      if (team.cabinReserved) {
        throw new Error('El equipo ya tiene una cabaña reservada');
      }
      
      return team;
    } catch (error) {
      console.error('Error al verificar disponibilidad del equipo:', error);
      throw error;
    }
  }
  
  /**
   * Obtiene todas las reservas activas
   * @returns {Array} Lista de reservas activas
   */
  async getActiveReservations() {
    try {
      // Obtener todas las cabañas reservadas u ocupadas
      const cabins = await campaignService.getReservedCabins();
      
      // Formatear la respuesta
      return cabins.map(cabin => ({
        cabinId: cabin.id,
        cabinName: cabin.name,
        teamId: cabin.teamAssigned,
        status: cabin.reservationStatus,
        checkInDate: cabin.checkInDate,
        checkOutDate: cabin.checkOutDate
      }));
    } catch (error) {
      console.error('Error al obtener reservas activas:', error);
      throw error;
    }
  }
  
  /**
   * Obtiene el historial de reservas de un equipo
   * @param {string} teamId - ID del equipo
   * @returns {Array} Historial de reservas
   */
  async getTeamReservationHistory(teamId) {
    // Esta función requeriría implementar un sistema de historial de reservas
    // que actualmente no está incluido en el modelo de datos de Notion
    throw new Error('Función no implementada');
  }
}

module.exports = new ReservationService();