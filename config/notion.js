const { Client } = require('@notionhq/client');

// Inicializar el cliente de Notion con el token
const notion = new Client({
  auth: process.env.NOTION_TOKEN
});

// IDs de las bases de datos
const databaseId = process.env.NOTION_DATABASE_ID;
const campaignsDatabaseId = process.env.NOTION_CAMPAIGNS_DATABASE_ID;

module.exports = {
  notion,
  databaseId,
  campaignsDatabaseId
};