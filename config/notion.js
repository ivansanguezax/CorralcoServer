const { Client } = require('@notionhq/client');

// Inicializar cliente de Notion con token de API
const notion = new Client({
  auth: process.env.NOTION_TOKEN
});

// ID de base de datos de equipos
const databaseId = process.env.NOTION_DATABASE_ID;

// ID de base de datos de cabañas/hostales
const campaignsDatabaseId = process.env.NOTION_CAMPAIGNS_DATABASE_ID;

// ID de base de datos de horarios
const horariosDatabaseId = process.env.NOTION_HORARIOS_DATABASE_ID;

// ID de base de datos de pasajeros
const pasajerosDatabaseId = process.env.NOTION_PASAJEROS_DATABASE_ID;

// Formato esperado para las propiedades de la base de datos de cabañas/hostales
const campaignProperties = {
  // Propiedades existentes
  Name: { type: 'title' },
  slug: { type: 'rich_text' },
  Category: { type: 'select' },
  gym: { type: 'checkbox' },
  skiroom: { type: 'checkbox' },
  food: { type: 'checkbox' },
  direction: { type: 'rich_text' },
  linkMaps: { type: 'url' },
  banner: { type: 'url' },
  
  // Nuevas propiedades
  AccommodationType: { type: 'select', options: ['Cabaña', 'Hostal'] },
  TotalCapacity: { type: 'number' }
};

// Formato esperado para las propiedades de la base de datos de horarios
const horariosProperties = {
  // Propiedades existentes
  'Cabañas': { type: 'relation' },
  'Equipo': { type: 'relation' },
  'Check-in': { type: 'date' },
  'Check-out': { type: 'date' },
  'precioTotal': { type: 'number' },
  
  // Nuevas propiedades
  'NumBeds': { type: 'number' },
  'Estado': { type: 'select', options: ['Pendiente', 'Confirmada', 'En curso', 'Completada', 'Cancelada'] }
};

// Función para verificar y crear propiedades faltantes en las bases de datos
async function validateDatabaseSchemas() {
  try {
    console.log('Validando esquemas de bases de datos...');
    
    // Validar esquema de cabañas/hostales
    const campaignsDb = await notion.databases.retrieve({
      database_id: campaignsDatabaseId
    });
    
    const campaignsProperties = campaignsDb.properties;
    const missingCampaignProps = [];
    
    // Verificar propiedades faltantes
    for (const [propName, propConfig] of Object.entries(campaignProperties)) {
      if (!campaignsProperties[propName]) {
        missingCampaignProps.push({
          name: propName,
          type: propConfig.type,
          options: propConfig.options
        });
      }
    }
    
    // Mostrar advertencia si faltan propiedades
    if (missingCampaignProps.length > 0) {
      console.warn('ADVERTENCIA: Faltan propiedades en la base de datos de cabañas/hostales:');
      missingCampaignProps.forEach(prop => {
        console.warn(`- ${prop.name} (${prop.type})`);
      });
      console.warn('Debes añadir estas propiedades manualmente en Notion para el correcto funcionamiento del sistema.');
    } else {
      console.log('Esquema de cabañas/hostales validado correctamente.');
    }
    
    // Validar esquema de horarios
    const horariosDb = await notion.databases.retrieve({
      database_id: horariosDatabaseId
    });
    
    const horariosDbProps = horariosDb.properties;
    const missingHorariosProps = [];
    
    // Verificar propiedades faltantes
    for (const [propName, propConfig] of Object.entries(horariosProperties)) {
      if (!horariosDbProps[propName]) {
        missingHorariosProps.push({
          name: propName,
          type: propConfig.type,
          options: propConfig.options
        });
      }
    }
    
    // Mostrar advertencia si faltan propiedades
    if (missingHorariosProps.length > 0) {
      console.warn('ADVERTENCIA: Faltan propiedades en la base de datos de horarios:');
      missingHorariosProps.forEach(prop => {
        console.warn(`- ${prop.name} (${prop.type})`);
      });
      console.warn('Debes añadir estas propiedades manualmente en Notion para el correcto funcionamiento del sistema.');
    } else {
      console.log('Esquema de horarios validado correctamente.');
    }
  } catch (error) {
    console.error('Error al validar esquemas de bases de datos:', error);
  }
}

// Ejecutar validación de esquemas al cargar el módulo (en producción)
if (process.env.NODE_ENV === 'production') {
  validateDatabaseSchemas();
}

module.exports = {
  notion,
  databaseId,
  campaignsDatabaseId,
  horariosDatabaseId,
  pasajerosDatabaseId,
  validateDatabaseSchemas
};